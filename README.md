# Fraud AI

A **local fraud-review and transaction-risk analysis prototype** built for security and fintech experimentation.

Fraud AI provides an analyst login, transaction dashboard, explainable risk scoring, review actions, JSON API endpoints, and SQLite persistence — all running locally from a single Python application.

> **Note:** The risk score uses an explainable **weighted rules engine**, not a trained machine-learning model. All sample transaction data is fictional.

# Screenshots
 <img src="Screenshot 2026-10-05 011402.png">
 <img src="Screenshot 2026-10-05 011253.png">
<img src="Screenshot 2026-10-05 011305.png">
<img src="Screenshot 2026-10-05 011105.png">

## 🚀 Features

* 🔐 Analyst authentication
* 📊 Transaction monitoring dashboard
* ⚠️ Explainable fraud-risk scoring
* 🔎 Transaction search and filtering
* ✅ Clear or 🚫 block transaction reviews
* 🗄️ SQLite database persistence
* 🔌 JSON REST API
* ❤️ Health-check endpoint
* ⚙️ Configurable database path
* 🌐 Configurable server port
* 🖥️ Fully local development environment

## 🏗️ Architecture

```text
Fraud AI
│
├── Analyst Login
│
├── Transaction Dashboard
│   ├── Transaction Metrics
│   ├── Risk Scores
│   ├── Search & Filters
│   └── Review Actions
│
├── Fraud Risk Engine
│   └── Weighted Rules
│
├── JSON API
│   ├── Health
│   ├── Summary
│   ├── Transactions
│   └── Review Actions
│
└── SQLite
    └── fraud.db
```

## 🧠 Risk Scoring

Fraud AI currently uses a **weighted rule-based risk engine**.

Instead of making an unexplained prediction, the system evaluates transaction characteristics against predefined rules and produces an explainable risk score.

This makes the prototype useful for demonstrating:

* Transaction risk analysis
* Fraud-review workflows
* Rule-based detection
* Analyst decision-making
* Security monitoring concepts

## 💻 Run Locally

### 1. Open PowerShell

Navigate to the project directory:

```powershell
cd "C:\Users\INVESTOR\Desktop\Fraud AI"
```

### 2. Create a virtual environment

```powershell
py -m venv .venv
```

### 3. Activate the virtual environment

```powershell
.\.venv\Scripts\Activate.ps1
```

### 4. Start the application

```powershell
python main.py
```

### 5. Open the application

Visit:

```text
http://127.0.0.1:5050
```

The login page displays the local demo credentials beneath the form.

### Demo Credentials

```text
Email:    analyst@fraud.ai
Password: risk2026
```

> These credentials are intended **only for local demonstration purposes**.

## 🔌 API

The API is served by the same application and port as the web interface.

All endpoints except `/api/health` require an authenticated analyst session cookie.

### Health Check

```http
GET /api/health
```

Checks whether the application is available.

### Summary

```http
GET /api/summary
```

Returns transaction and review metrics.

### Transactions

```http
GET /api/transactions
```

Supports filtering and searching.

Example:

```http
GET /api/transactions?status=OPEN&q=Olivia
```

### Review Transaction

```http
PATCH /api/transactions/<id>/review
```

Accepts either:

```json
{
  "action": "clear"
}
```

or:

```json
{
  "action": "block"
}
```

The review decision is recorded in SQLite.

## 🗄️ Database

By default, transaction data is stored in:

```text
fraud.db
```

You can specify a different database location with:

```powershell
$env:FRAUD_DB_PATH="C:\path\to\custom.db"
```

## ⚙️ Configuration

### Database Path

```text
FRAUD_DB_PATH
```

Changes the location of the SQLite database.

### Server Port

```text
PORT
```

Changes the application port.

Example:

```powershell
$env:PORT="8080"
python main.py
```

The application will then be available at:

```text
http://127.0.0.1:8080
```

## 🔐 Local Security Considerations

Fraud AI is a **demonstration application**, not a production fintech integration.

The current prototype uses:

* Seeded fictional transaction data
* Configurable demo credentials
* Local SQLite persistence
* A local development server
* Rule-based risk scoring

It does **not** connect to:

* Banks
* Payment processors
* Real customer financial accounts
* External AI services
* Production financial systems

### Before Production Deployment

A production implementation would require additional security controls, including:

* Replace demo authentication with a proper identity provider
* Use a strong randomly generated `FLASK_SECRET_KEY`
* Implement CSRF protection
* Add authentication rate limiting
* Secure session configuration
* Add proper authorization and role management
* Validate and sanitize API input
* Implement audit logging
* Encrypt sensitive data where appropriate
* Secure database credentials and configuration
* Add monitoring and alerting
* Review applicable financial-data and privacy requirements

## 🧪 Project Status

**Status:** Local prototype / security & fintech laboratory project

The project is intended for experimentation with:

* Fraud detection concepts
* Web application security
* API security
* Transaction monitoring
* Analyst workflows
* Secure application development

## ⚠️ Disclaimer

Fraud AI is an educational and experimental project.

All transaction records and user information included in the application are fictional. Do not connect this prototype to real financial accounts, payment systems, or sensitive customer data without implementing appropriate security, privacy, compliance, and operational controls.
