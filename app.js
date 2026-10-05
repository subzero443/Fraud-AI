const state = { transactions: [], summary: null, status: "ALL", selectedId: null, loading: false };
const analyst = document.body.dataset.analyst;

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
}).format(value);

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

function timeAgo(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function visibleTransactions() {
  const search = document.querySelector("#transaction-search").value.trim().toLowerCase();
  return state.transactions.filter((transaction) => {
    const statusMatch = state.status === "ALL" || transaction.status === state.status;
    const searchMatch = !search || [transaction.reference, transaction.customer, transaction.merchant]
      .some((field) => field.toLowerCase().includes(search));
    return statusMatch && searchMatch;
  });
}

async function loadData() {
  state.loading = true;
  try {
    const [summaryResponse, transactionsResponse] = await Promise.all([
      fetch("/api/summary"), fetch("/api/transactions"),
    ]);
    if (!summaryResponse.ok || !transactionsResponse.ok) throw new Error("Could not load risk data.");
    state.summary = await summaryResponse.json();
    state.transactions = (await transactionsResponse.json()).transactions;
    render();
  } catch (error) {
    document.querySelector("#transaction-rows").innerHTML = '<tr><td colspan="6" class="table-message table-error">Risk data could not be loaded. Refresh to retry.</td></tr>';
    document.querySelector("#transaction-detail").innerHTML = '<div class="detail-empty">The risk API is unavailable. Check the server and refresh.</div>';
  } finally {
    state.loading = false;
    document.querySelector("#refresh-button").classList.remove("is-loading");
  }
}

function renderMetrics() {
  const metrics = state.summary;
  document.querySelector("#metric-total").textContent = metrics.transactions_today.toLocaleString();
  document.querySelector("#metric-review").textContent = metrics.needs_review.toLocaleString();
  document.querySelector("#metric-high").textContent = metrics.high_risk.toLocaleString();
  document.querySelector("#metric-blocked").textContent = money(metrics.blocked_amount);
  document.querySelector("#metric-review-rate").textContent = `${metrics.review_rate}%`;
  document.querySelector("#sidebar-review-count").textContent = metrics.needs_review;
  document.querySelector("#count-all").textContent = state.transactions.length;
  document.querySelector("#count-open").textContent = state.transactions.filter((item) => item.status === "OPEN").length;
  document.querySelector("#count-blocked").textContent = state.transactions.filter((item) => item.status === "BLOCKED").length;

  const open = state.transactions.filter((item) => item.status === "OPEN");
  const levels = ["low", "medium", "high", "critical"];
  const counts = Object.fromEntries(levels.map((level) => [level, open.filter((item) => item.risk_level === level).length]));
  const maxCount = Math.max(1, ...Object.values(counts));
  document.querySelector("#risk-distribution").innerHTML = levels.map((level) => `
    <div class="distribution-item">
      <div class="distribution-bar"><span class="level-${level}" style="width:${Math.max(5, counts[level] / maxCount * 100)}%"></span></div>
      <div class="distribution-count"><strong>${counts[level]}</strong><span>${level}</span></div>
    </div>`).join("");
}

function renderRows(rows) {
  const body = document.querySelector("#transaction-rows");
  document.querySelector("#queue-total").textContent = `${rows.length} ${rows.length === 1 ? "record" : "records"}`;
  document.querySelector("#table-foot-label").textContent = rows.length
    ? `Showing ${rows.length} of ${state.transactions.length} transactions`
    : "No matching transactions";
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6" class="table-message">No transactions match this view.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((item) => `
    <tr class="transaction-row ${item.id === state.selectedId ? "selected" : ""}" data-id="${item.id}" tabindex="0" aria-label="Inspect ${escapeHTML(item.reference)}">
      <td><div class="transaction-person"><span class="customer-avatar avatar-tone-${item.id % 5}">${escapeHTML(item.customer.split(" ").map((part) => part[0]).join("").slice(0, 2))}</span><span><strong>${escapeHTML(item.customer)}</strong><small>${escapeHTML(item.reference)}</small></span></div></td>
      <td><span class="merchant-name">${escapeHTML(item.merchant)}</span><small class="merchant-category">${escapeHTML(item.category)}</small></td>
      <td class="amount-cell">${money(item.amount)}</td>
      <td><span class="score-pill score-${item.risk_level}"><i></i>${item.score}<small>/ 99</small></span></td>
      <td><span class="status-pill status-${item.status.toLowerCase()}"><i></i>${item.status === "OPEN" ? "Review" : item.status === "CLEARED" ? "Cleared" : "Blocked"}</span></td>
      <td class="time-cell">${timeAgo(item.occurred_at)}</td>
    </tr>`).join("");
}

function renderDetail(transaction) {
  const panel = document.querySelector("#transaction-detail");
  if (!transaction) {
    panel.innerHTML = '<div class="detail-empty">Select a transaction to inspect its risk signals.</div>';
    return;
  }
  const actionButtons = transaction.status === "OPEN" ? `
    <div class="decision-actions">
      <button class="decision-button decision-block" data-action="block" data-id="${transaction.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>Block transaction</button>
      <button class="decision-button decision-clear" data-action="clear" data-id="${transaction.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>Clear as legitimate</button>
    </div>` : `<div class="reviewed-banner reviewed-${transaction.status.toLowerCase()}"><span>${transaction.status === "BLOCKED" ? "Transaction blocked" : "Marked legitimate"}</span><small>${transaction.reviewed_by ? `Reviewed by ${escapeHTML(transaction.reviewed_by)}` : "Previously reviewed"}</small></div>`;
  const factorList = transaction.factors.length
    ? transaction.factors.map((factor, index) => `<li><span class="factor-number">0${index + 1}</span><span>${escapeHTML(factor)}</span><i></i></li>`).join("")
    : '<li class="no-factors">No elevated risk signals detected.</li>';

  panel.innerHTML = `
    <div class="detail-topline"><span class="eyebrow">TRANSACTION REVIEW</span><button type="button" class="detail-more" title="Transaction reference" aria-label="Transaction reference">•••</button></div>
    <div class="detail-reference">${escapeHTML(transaction.reference)} <span class="detail-status status-${transaction.status.toLowerCase()}">${transaction.status === "OPEN" ? "OPEN" : transaction.status}</span></div>
    <div class="risk-score-block">
      <div class="risk-gauge risk-gauge-${transaction.risk_level}" style="--score-angle:${transaction.score / 99 * 360}deg"><div><strong>${transaction.score}</strong><span>RISK SCORE</span></div></div>
      <div class="risk-summary"><span class="risk-level-label level-text-${transaction.risk_level}">${transaction.risk_level} risk</span><strong>${transaction.factors.length} signal${transaction.factors.length === 1 ? "" : "s"} detected</strong><span>Explainable rule-based score</span></div>
    </div>
    <div class="detail-divider"></div>
    <section class="detail-section"><div class="detail-section-heading"><h3>Risk signals</h3><span>${transaction.factors.length} FLAGS</span></div><ul class="factor-list">${factorList}</ul></section>
    <div class="detail-divider"></div>
    <section class="detail-section transaction-context"><div class="detail-section-heading"><h3>Transaction context</h3><span>EVENT DATA</span></div>
      <div class="context-person"><span class="customer-avatar avatar-tone-${transaction.id % 5}">${escapeHTML(transaction.customer.split(" ").map((part) => part[0]).join("").slice(0, 2))}</span><span><strong>${escapeHTML(transaction.customer)}</strong><small>${escapeHTML(transaction.email)}</small></span></div>
      <dl class="context-grid"><div><dt>Amount</dt><dd>${money(transaction.amount)}</dd></div><div><dt>Merchant</dt><dd>${escapeHTML(transaction.merchant)}</dd></div><div><dt>Location</dt><dd>${escapeHTML(transaction.city)}, ${escapeHTML(transaction.country)}</dd></div><div><dt>Channel</dt><dd>${escapeHTML(transaction.channel)}</dd></div><div><dt>Device</dt><dd>${transaction.device_trusted ? "Recognized" : "Unrecognized"}</dd></div><div><dt>1h velocity</dt><dd>${transaction.velocity_1h} transactions</dd></div></dl>
    </section>${actionButtons}`;
}

function render() {
  if (!state.summary) return;
  renderMetrics();
  const rows = visibleTransactions();
  if (!rows.some((item) => item.id === state.selectedId)) {
    const open = rows.filter((item) => item.status === "OPEN");
    state.selectedId = (open.length ? open : rows).reduce((highest, item) => !highest || item.score > highest.score ? item : highest, null)?.id ?? null;
  }
  renderRows(rows);
  renderDetail(state.transactions.find((item) => item.id === state.selectedId));
}

function revealMobileDetail() {
  if (!window.matchMedia("(max-width: 1050px)").matches) return;
  document.querySelector("#transaction-detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function reviewTransaction(id, action) {
  const button = document.querySelector(`[data-action="${action}"][data-id="${id}"]`);
  if (button) button.disabled = true;
  try {
    const response = await fetch(`/api/transactions/${id}/review`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Review action failed.");
    state.selectedId = id;
    await loadData();
  } catch (error) {
    window.alert(error.message);
    if (button) button.disabled = false;
  }
}

document.querySelector("#current-date").textContent = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric",
}).format(new Date());
document.querySelector("#dashboard-date").textContent = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "2-digit", year: "numeric",
}).format(new Date()).toUpperCase();

document.querySelector("#refresh-button").addEventListener("click", () => {
  document.querySelector("#refresh-button").classList.add("is-loading");
  loadData();
});
document.querySelector("#transaction-search").addEventListener("input", render);
document.querySelectorAll(".filter-tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".filter-tab").forEach((item) => {
    item.classList.toggle("active", item === tab);
    item.setAttribute("aria-selected", item === tab ? "true" : "false");
  });
  state.status = tab.dataset.status;
  state.selectedId = null;
  render();
}));
document.querySelector("#transaction-rows").addEventListener("click", (event) => {
  const row = event.target.closest(".transaction-row");
  if (!row) return;
  state.selectedId = Number(row.dataset.id);
  render();
  revealMobileDetail();
});
document.querySelector("#transaction-rows").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest(".transaction-row");
  if (!row) return;
  event.preventDefault();
  state.selectedId = Number(row.dataset.id);
  render();
  revealMobileDetail();
});
document.querySelector("#transaction-detail").addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) reviewTransaction(Number(button.dataset.id), button.dataset.action);
});
document.querySelector("[data-focus-queue]").addEventListener("click", () => {
  state.status = "OPEN";
  document.querySelector('[data-status="OPEN"]').click();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.querySelector("#transaction-search").focus();
  }
});

loadData();
setInterval(loadData, 60000);