/**
 * budget.js
 * Controls Feature 5: Budget Management — setting monthly budgets,
 * tracking monthly spending, calculating remaining balance & utilization %,
 * triggering 80% warning and 100%+ exceeded alerts, and updating the sidebar indicator.
 */

import { getTransactions, getBudgetAmountForMonth, saveBudgetForMonth } from './storage.js';
import {
  getMonthlySpending,
  getCategoryBreakdown,
  formatCurrency,
  formatMonthLabel,
  escapeHtml
} from './transactions.js';

let budgetCallbacks = {
  getActiveMonth: () => '',
  onDataChange: () => {},
  showToast: () => {}
};

/**
 * Pure calculation helper for budget status (storage-independent).
 * @param {number} spent
 * @param {number} budget
 */
export function calculateBudgetMetrics(spent, budget) {
  const safeSpent = Math.max(0, Number(spent) || 0);
  const safeBudget = Math.max(0, Number(budget) || 0);
  const remaining = safeBudget - safeSpent;
  const utilization = safeBudget > 0 ? (safeSpent / safeBudget) * 100 : 0;

  let status = 'unset';
  if (safeBudget > 0) {
    if (utilization >= 100) {
      status = 'exceeded';
    } else if (utilization >= 80) {
      status = 'warning';
    } else {
      status = 'healthy';
    }
  }

  return {
    budget: safeBudget,
    spent: safeSpent,
    remaining,
    utilization,
    status
  };
}

/**
 * Initializes Budget Management form listener.
 * @param {object} callbacks
 */
export function initBudgetModule(callbacks) {
  budgetCallbacks = { ...budgetCallbacks, ...callbacks };

  const form = document.getElementById('budget-form');
  const amountInput = document.getElementById('budget-amount-input');
  const errorEl = document.getElementById('budget-amount-error');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (errorEl) errorEl.textContent = '';
    amountInput?.classList.remove('invalid');

    const raw = parseFloat(amountInput?.value || '');
    if (!Number.isFinite(raw) || raw <= 0) {
      amountInput?.classList.add('invalid');
      if (errorEl) errorEl.textContent = 'Enter a valid monthly budget greater than $0.';
      return;
    }

    const activeMonth = budgetCallbacks.getActiveMonth();
    saveBudgetForMonth(activeMonth, raw);
    budgetCallbacks.showToast(`Budget updated for ${formatMonthLabel(activeMonth)}`, 'success');
    budgetCallbacks.onDataChange();
  });
}

/**
 * Renders both the Budget Management view and the sidebar compact budget indicator.
 * @param {string} activeMonthKey
 */
export function renderBudget(activeMonthKey) {
  const transactions = getTransactions();
  const spent = getMonthlySpending(transactions, activeMonthKey);
  const budget = getBudgetAmountForMonth(activeMonthKey);
  const metrics = calculateBudgetMetrics(spent, budget);
  const monthLabel = formatMonthLabel(activeMonthKey);

  // 1. Update Sidebar Budget Widget
  renderSidebarBudgetWidget(metrics, monthLabel);

  // 2. Update Budget View Elements
  const periodLabel = document.getElementById('budget-period-label');
  const monthDisplay = document.getElementById('budget-month-display');
  const amountInput = document.getElementById('budget-amount-input');
  const targetVal = document.getElementById('budget-target-val');
  const spentVal = document.getElementById('budget-spent-val');
  const remainingVal = document.getElementById('budget-remaining-val');
  const utilizationVal = document.getElementById('budget-utilization-val');
  const statusLabel = document.getElementById('budget-status-label');
  const progressFill = document.getElementById('budget-progress-fill');
  const statusBanner = document.getElementById('budget-status-banner');

  if (periodLabel) periodLabel.textContent = `Tracking monthly expenses for ${monthLabel}`;
  if (monthDisplay) monthDisplay.value = monthLabel;
  if (amountInput && document.activeElement !== amountInput) {
    amountInput.value = metrics.budget > 0 ? String(metrics.budget) : '';
  }

  if (targetVal) targetVal.textContent = formatCurrency(metrics.budget);
  if (spentVal) spentVal.textContent = formatCurrency(metrics.spent);

  if (remainingVal) {
    if (metrics.budget <= 0) {
      remainingVal.textContent = '—';
      remainingVal.className = 'budget-metric-val mono';
    } else if (metrics.remaining < 0) {
      remainingVal.textContent = `-${formatCurrency(Math.abs(metrics.remaining))}`;
      remainingVal.className = 'budget-metric-val mono text-expense';
    } else {
      remainingVal.textContent = formatCurrency(metrics.remaining);
      remainingVal.className = 'budget-metric-val mono text-income';
    }
  }

  if (utilizationVal) {
    utilizationVal.textContent = `${metrics.utilization.toFixed(1)}%`;
    utilizationVal.className = `budget-metric-val mono ${
      metrics.status === 'exceeded'
        ? 'text-expense'
        : metrics.status === 'warning'
        ? 'text-warning'
        : ''
    }`;
  }

  if (statusLabel) {
    if (metrics.status === 'unset') {
      statusLabel.textContent = 'Not Set';
      statusLabel.className = 'status-text';
    } else if (metrics.status === 'exceeded') {
      statusLabel.textContent = 'Budget Exceeded';
      statusLabel.className = 'status-text danger';
    } else if (metrics.status === 'warning') {
      statusLabel.textContent = 'Warning (80%+)';
      statusLabel.className = 'status-text warning';
    } else {
      statusLabel.textContent = 'On Track';
      statusLabel.className = 'status-text';
    }
  }

  if (progressFill) {
    const clampedPct = Math.min(100, Math.max(0, metrics.utilization));
    progressFill.style.width = `${clampedPct}%`;
    progressFill.className = `progress-fill ${
      metrics.status === 'exceeded' ? 'danger' : metrics.status === 'warning' ? 'warning' : ''
    }`;
  }

  if (statusBanner) {
    if (metrics.status === 'exceeded') {
      const overAmount = Math.abs(metrics.remaining);
      statusBanner.className = 'alert-banner danger';
      statusBanner.innerHTML = `
        <i data-lucide="alert-octagon"></i>
        <div class="alert-banner-content">
          <strong>Budget Exceeded Alert</strong>
          <p>Monthly expenses (${formatCurrency(metrics.spent)}) exceeded your ${formatCurrency(metrics.budget)} limit by ${formatCurrency(overAmount)} (${metrics.utilization.toFixed(1)}% utilization).</p>
        </div>`;
    } else if (metrics.status === 'warning') {
      statusBanner.className = 'alert-banner warning';
      statusBanner.innerHTML = `
        <i data-lucide="alert-triangle"></i>
        <div class="alert-banner-content">
          <strong>80% Budget Spending Warning</strong>
          <p>You have utilized ${metrics.utilization.toFixed(1)}% of your ${monthLabel} budget. Remaining budget: ${formatCurrency(metrics.remaining)}.</p>
        </div>`;
    } else {
      statusBanner.className = 'alert-banner hidden';
      statusBanner.innerHTML = '';
    }
  }

  // 3. Monthly Category Spending Breakdown relative to total budget
  renderBudgetCategoryBars(transactions, activeMonthKey, metrics.budget);
}

function renderSidebarBudgetWidget(metrics, monthLabel) {
  const pctEl = document.getElementById('sidebar-budget-pct');
  const barEl = document.getElementById('sidebar-budget-bar');
  const captionEl = document.getElementById('sidebar-budget-caption');

  if (pctEl) pctEl.textContent = `${metrics.utilization.toFixed(0)}%`;
  if (barEl) {
    barEl.style.width = `${Math.min(100, Math.max(0, metrics.utilization))}%`;
    barEl.className = `progress-fill ${
      metrics.status === 'exceeded' ? 'danger' : metrics.status === 'warning' ? 'warning' : ''
    }`;
  }
  if (captionEl) {
    if (metrics.budget <= 0) {
      captionEl.textContent = `No budget set for ${monthLabel}`;
    } else if (metrics.remaining < 0) {
      captionEl.textContent = `Over by ${formatCurrency(Math.abs(metrics.remaining))}`;
    } else {
      captionEl.textContent = `${formatCurrency(metrics.remaining)} left of ${formatCurrency(metrics.budget)}`;
    }
  }
}

function renderBudgetCategoryBars(transactions, activeMonthKey, monthlyBudget) {
  const container = document.getElementById('budget-category-bars');
  if (!container) return;

  const monthTxns = transactions.filter((t) => String(t.date).startsWith(activeMonthKey));
  const breakdown = getCategoryBreakdown(monthTxns, 'expense');

  if (breakdown.length === 0) {
    container.innerHTML = `<p class="kpi-meta">No expenses recorded in ${escapeHtml(formatMonthLabel(activeMonthKey))} yet.</p>`;
    return;
  }

  const denominator = monthlyBudget > 0 ? monthlyBudget : breakdown.reduce((s, b) => s + b.amount, 0);

  container.innerHTML = breakdown
    .map((item) => {
      const sharePct = denominator > 0 ? Math.min(100, (item.amount / denominator) * 100) : 0;
      return `
        <div class="category-bar-item">
          <div class="category-bar-head">
            <span>${escapeHtml(item.category)}</span>
            <span class="mono">${formatCurrency(item.amount)} (${sharePct.toFixed(1)}%)</span>
          </div>
          <div class="progress-track progress-track-sm">
            <div class="progress-fill" style="width: ${sharePct}%; background-color: ${item.color}"></div>
          </div>
        </div>`;
    })
    .join('');
}
