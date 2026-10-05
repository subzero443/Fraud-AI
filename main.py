import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for


ROOT = Path(__file__).resolve().parent
DATABASE = Path(os.environ.get("FRAUD_DB_PATH", ROOT / "fraud.db"))
DEMO_USERNAME = os.environ.get("DEMO_USERNAME", "analyst@fraud.ai")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "risk2026")

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "local-development-secret-change-me")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")


def connect_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def score_transaction(transaction):
    score = 0
    factors = []

    if transaction["amount"] >= 5000:
        score += 25
        factors.append("High transaction amount")
    elif transaction["amount"] >= 1500:
        score += 14
        factors.append("Elevated transaction amount")
    if not transaction["device_trusted"]:
        score += 20
        factors.append("Unrecognized device")
    if transaction["cross_border"]:
        score += 18
        factors.append("Cross-border activity")
    if transaction["velocity_1h"] >= 4:
        score += 22
        factors.append("Unusually high transaction velocity")
    elif transaction["velocity_1h"] >= 2:
        score += 12
        factors.append("Multiple transactions in one hour")
    if transaction["category"].lower() in {"crypto", "cash transfer", "wire transfer"}:
        score += 15
        factors.append("Higher-risk merchant category")
    if transaction["unusual_hour"]:
        score += 8
        factors.append("Unusual transaction time")

    score = min(score, 99)
    level = "critical" if score >= 75 else "high" if score >= 50 else "medium" if score >= 25 else "low"
    return score, level, factors


def initialize_database():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT NOT NULL UNIQUE,
                customer TEXT NOT NULL,
                email TEXT NOT NULL,
                merchant TEXT NOT NULL,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                city TEXT NOT NULL,
                country TEXT NOT NULL,
                channel TEXT NOT NULL,
                device_trusted INTEGER NOT NULL,
                cross_border INTEGER NOT NULL,
                velocity_1h INTEGER NOT NULL,
                unusual_hour INTEGER NOT NULL,
                occurred_at TEXT NOT NULL,
                score INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                factors TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'OPEN',
                decision TEXT,
                reviewed_at TEXT,
                reviewed_by TEXT
            )"""
        )
        if connection.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]:
            return

        samples = [
            ("TX-847291", "Olivia Chen", "olivia.chen@email.test", "Atlas Digital Assets", "Crypto", 8420.00, "USD", "Bucharest", "RO", "Mobile", 0, 1, 5, 1, 4, "OPEN"),
            ("TX-847288", "Marcus Reed", "marcus.reed@email.test", "Nova Electronics", "Electronics", 1280.50, "USD", "Austin", "US", "Web", 1, 0, 1, 0, 11, "OPEN"),
            ("TX-847284", "Amina Yusuf", "amina.yusuf@email.test", "Rapid Remit", "Cash transfer", 3650.00, "USD", "Lagos", "NG", "Mobile", 0, 1, 4, 0, 19, "OPEN"),
            ("TX-847279", "Ethan Brooks", "ethan.brooks@email.test", "Harbor Travel", "Travel", 2190.00, "USD", "Miami", "US", "Web", 1, 0, 2, 0, 32, "CLEARED"),
            ("TX-847275", "Sofia Martinez", "sofia.martinez@email.test", "Lumen Watches", "Luxury goods", 5940.00, "USD", "Madrid", "ES", "Mobile", 0, 1, 2, 1, 48, "OPEN"),
            ("TX-847268", "Noah Williams", "noah.williams@email.test", "Greenway Market", "Grocery", 86.24, "USD", "Seattle", "US", "Card", 1, 0, 1, 0, 73, "CLEARED"),
            ("TX-847261", "Priya Nair", "priya.nair@email.test", "Vertex Cloud", "Software", 890.00, "USD", "Singapore", "SG", "Web", 0, 1, 3, 1, 96, "BLOCKED"),
            ("TX-847254", "Daniel Kim", "daniel.kim@email.test", "Metro Fuel", "Fuel", 142.70, "USD", "Denver", "US", "Card", 1, 0, 1, 0, 121, "CLEARED"),
            ("TX-847249", "Isabella Rossi", "isabella.rossi@email.test", "Orbit Wire Services", "Wire transfer", 12750.00, "USD", "Rome", "IT", "Web", 0, 1, 4, 1, 155, "OPEN"),
            ("TX-847243", "Liam Patel", "liam.patel@email.test", "Daily Table", "Dining", 74.80, "USD", "Chicago", "US", "Mobile", 1, 0, 1, 0, 187, "CLEARED"),
        ]
        now = datetime.now(timezone.utc)
        for sample in samples:
            (reference, customer, email, merchant, category, amount, currency, city, country,
             channel, trusted, cross_border, velocity, unusual, minutes_ago, status) = sample
            transaction = {"amount": amount, "category": category, "device_trusted": trusted,
                           "cross_border": cross_border, "velocity_1h": velocity,
                           "unusual_hour": unusual}
            score, level, factors = score_transaction(transaction)
            connection.execute(
                """INSERT INTO transactions (
                    reference, customer, email, merchant, category, amount, currency,
                    city, country, channel, device_trusted, cross_border, velocity_1h,
                    unusual_hour, occurred_at, score, risk_level, factors, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (reference, customer, email, merchant, category, amount, currency,
                 city, country, channel, trusted, cross_border, velocity, unusual,
                 (now - timedelta(minutes=minutes_ago)).isoformat(), score, level,
                 json.dumps(factors), status),
            )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("analyst"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for("home"))
        return view(*args, **kwargs)
    return wrapped


def serialize_transaction(row):
    item = dict(row)
    item["device_trusted"] = bool(item["device_trusted"])
    item["cross_border"] = bool(item["cross_border"])
    item["unusual_hour"] = bool(item["unusual_hour"])
    item["factors"] = json.loads(item["factors"])
    return item


@app.get("/")
def home():
    if session.get("analyst"):
        return redirect(url_for("dashboard"))
    return render_template("login.html", username=DEMO_USERNAME, password=DEMO_PASSWORD, error=None)


@app.post("/login")
def login():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if username == DEMO_USERNAME and password == DEMO_PASSWORD:
        session.clear()
        session["analyst"] = username
        return redirect(url_for("dashboard"))
    return render_template("login.html", username=DEMO_USERNAME, password=DEMO_PASSWORD,
                           error="Those credentials don't match. Please try again."), 401


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("home"))


@app.get("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", analyst=session["analyst"])


@app.get("/api/summary")
@login_required
def summary():
    with connect_db() as connection:
        rows = connection.execute("SELECT amount, risk_level, status FROM transactions").fetchall()
    total = len(rows)
    open_rows = [row for row in rows if row["status"] == "OPEN"]
    high_rows = [row for row in open_rows if row["risk_level"] in {"high", "critical"}]
    blocked_amount = sum(row["amount"] for row in rows if row["status"] == "BLOCKED")
    return jsonify({
        "transactions_today": total,
        "needs_review": len(open_rows),
        "high_risk": len(high_rows),
        "blocked_amount": blocked_amount,
        "review_rate": round((total - len(open_rows)) / total * 100) if total else 0,
    })


@app.get("/api/transactions")
@login_required
def transactions():
    status = request.args.get("status", "ALL").upper()
    search = request.args.get("q", "").strip()
    query = "SELECT * FROM transactions WHERE 1=1"
    values = []
    if status in {"OPEN", "CLEARED", "BLOCKED"}:
        query += " AND status = ?"
        values.append(status)
    if search:
        query += " AND (reference LIKE ? OR customer LIKE ? OR merchant LIKE ?)"
        values.extend([f"%{search}%"] * 3)
    query += " ORDER BY occurred_at DESC LIMIT 100"
    with connect_db() as connection:
        rows = connection.execute(query, values).fetchall()
    return jsonify({"transactions": [serialize_transaction(row) for row in rows]})


@app.patch("/api/transactions/<int:transaction_id>/review")
@login_required
def review_transaction(transaction_id):
    payload = request.get_json(silent=True) or {}
    action = payload.get("action")
    status = {"clear": "CLEARED", "block": "BLOCKED"}.get(action) # type: ignore
    if status is None:
        return jsonify({"error": "Action must be 'clear' or 'block'"}), 400
    with connect_db() as connection:
        result = connection.execute(
            "UPDATE transactions SET status = ?, decision = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ? AND status = 'OPEN'",
            (status, action.upper(), datetime.now(timezone.utc).isoformat(), session["analyst"], transaction_id), # type: ignore
        )
        if result.rowcount == 0:
            return jsonify({"error": "Transaction not found or already reviewed"}), 404
        row = connection.execute("SELECT * FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    return jsonify({"transaction": serialize_transaction(row)})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "fraud-ai-api"})


initialize_database()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5050")), debug=False)