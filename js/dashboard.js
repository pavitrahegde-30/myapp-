/**
 * dashboard.js
 * Controls Feature 1: Dashboard summary KPIs, Monthly Spending Overview chart,
 * Expense Category Breakdown chart, budget status alert, and Recent Transactions table.
 */

import { getTransactions, getBudgetAmountForMonth } from './storage.js';
import {
  calculateTotals,
  getMonthlySpending,
  getMonthlyIncome,
  getCategoryBreakdown,
  getMonthlyComparison,
  sortTransactions,
  formatCurrency,
  formatDate,
  formatMonthLabel,
  escapeHtml
} from './transactions.js';

let overviewChartInstance = null;
let categoryChartInstance = null;

/**
 * Renders the Dashboard view for the selected month key (YYYY-MM).
 * @param {string} activeMonthKey
 */
export function renderDashboard(activeMonthKey) {
  const transactions = getTransactions();
  const totals = calculateTotals(transactions);

  const monthExpenses = getMonthlySpending(transactions, activeMonthKey);
  const monthIncome = getMonthlyIncome(transactions, activeMonthKey);
  const monthlyBudget = getBudgetAmountForMonth(activeMonthKey);
  const monthLabel = formatMonthLabel(activeMonthKey);

  // 1. Update KPI Cards (Dynamic calculations; Total Balance = Total Income - Total Expenses)
  const balanceEl = document.getElementById('kpi-balance');
  const balanceMetaEl = document.getElementById('kpi-balance-meta');
  const incomeEl = document.getElementById('kpi-income');
  const incomeMetaEl = document.getElementById('kpi-income-meta');
  const expensesEl = document.getElementById('kpi-expenses');
  const expensesMetaEl = document.getElementById('kpi-expenses-meta');
  const monthlySpendingEl = document.getElementById('kpi-monthly-spending');
  const monthlyMetaEl = document.getElementById('kpi-monthly-meta');

  if (balanceEl) {
    balanceEl.textContent = formatCurrency(totals.totalBalance);
    balanceEl.className = `kpi-value mono ${totals.totalBalance < 0 ? 'text-expense' : ''}`;
  }
  if (balanceMetaEl) {
    balanceMetaEl.textContent = `Savings rate: ${totals.savingsRate.toFixed(1)}%`;
  }
  if (incomeEl) incomeEl.textContent = formatCurrency(totals.totalIncome);
  if (incomeMetaEl) {
    incomeMetaEl.textContent = `${totals.incomeCount} entries · ${formatCurrency(monthIncome)} in ${monthLabel}`;
  }
  if (expensesEl) expensesEl.textContent = formatCurrency(totals.totalExpenses);
  if (expensesMetaEl) {
    expensesMetaEl.textContent = `${totals.expenseCount} entries recorded`;
  }
  if (monthlySpendingEl) monthlySpendingEl.textContent = formatCurrency(monthExpenses);
  if (monthlyMetaEl) {
    if (monthlyBudget > 0) {
      const pct = (monthExpenses / monthlyBudget) * 100;
      monthlyMetaEl.textContent = `${pct.toFixed(1)}% of ${formatCurrency(monthlyBudget)} budget (${monthLabel})`;
    } else {
      monthlyMetaEl.textContent = `For ${monthLabel}`;
    }
  }

  // 2. Dashboard Budget Alert Banner (80% warning / 100%+ exceeded)
  renderDashboardBudgetAlert(monthExpenses, monthlyBudget, monthLabel);

  // 3. Monthly Spending Overview Chart
  renderOverviewChart(transactions, activeMonthKey);

  // 4. Expense Category Breakdown Chart & List
  const catSubtitle = document.getElementById('dashboard-category-subtitle');
  if (catSubtitle) catSubtitle.textContent = `${monthLabel} spending distribution`;
  renderCategoryBreakdown(transactions, activeMonthKey);

  // 5. Recent Transactions Table
  renderRecentTransactions(transactions);
}

function renderDashboardBudgetAlert(spent, budget, monthLabel) {
  const banner = document.getElementById('dashboard-budget-alert');
  if (!banner) return;

  if (budget <= 0) {
    banner.className = 'alert-banner hidden';
    banner.innerHTML = '';
    return;
  }

  const pct = (spent / budget) * 100;
  if (pct >= 100) {
    const over = spent - budget;
    banner.className = 'alert-banner danger';
    banner.innerHTML = `
      <i data-lucide="alert-octagon"></i>
      <div class="alert-banner-content">
        <strong>Budget Exceeded for ${escapeHtml(monthLabel)}</strong>
        <p>Monthly spending (${formatCurrency(spent)}) has exceeded your ${formatCurrency(budget)} budget by ${formatCurrency(over)} (${pct.toFixed(1)}% used).</p>
      </div>`;
  } else if (pct >= 80) {
    const remaining = budget - spent;
    banner.className = 'alert-banner warning';
    banner.innerHTML = `
      <i data-lucide="alert-triangle"></i>
      <div class="alert-banner-content">
        <strong>Approaching Monthly Budget Limit</strong>
        <p>You have used ${pct.toFixed(1)}% of your ${monthLabel} budget. ${formatCurrency(remaining)} remains.</p>
      </div>`;
  } else {
    banner.className = 'alert-banner hidden';
    banner.innerHTML = '';
  }
}

function renderOverviewChart(transactions, activeMonthKey) {
  const canvas = document.getElementById('dashboard-overview-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  const series = getMonthlyComparison(transactions, 6, activeMonthKey);
  if (overviewChartInstance) {
    overviewChartInstance.destroy();
  }

  overviewChartInstance = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.map((s) => s.label),
      datasets: [
        {
          label: 'Income',
          data: series.map((s) => s.income),
          backgroundColor: '#0f766e',
          borderRadius: 4,
          barPercentage: 0.65,
          categoryPercentage: 0.65
        },
        {
          label: 'Expenses',
          data: series.map((s) => s.expenses),
          backgroundColor: '#cbd5e1',
          hoverBackgroundColor: '#94a3b8',
          borderRadius: 4,
          barPercentage: 0.65,
          categoryPercentage: 0.65
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            color: '#475569',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11.5 }
          }
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`
          }
        }
      }
    }
  });
}

function renderCategoryBreakdown(transactions, activeMonthKey) {
  const canvas = document.getElementById('dashboard-category-chart');
  const listEl = document.getElementById('dashboard-category-list');
  if (!canvas || !listEl) return;

  const monthTxns = transactions.filter((t) => String(t.date).startsWith(activeMonthKey));
  const breakdown = getCategoryBreakdown(monthTxns, 'expense');

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
    categoryChartInstance = null;
  }

  if (breakdown.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    listEl.innerHTML = `<li class="kpi-meta">No expenses recorded for ${escapeHtml(formatMonthLabel(activeMonthKey))}.</li>`;
    return;
  }

  if (typeof window.Chart !== 'undefined') {
    categoryChartInstance = new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: breakdown.map((b) => b.category),
        datasets: [
          {
            data: breakdown.map((b) => b.amount),
            backgroundColor: breakdown.map((b) => b.color),
            borderWidth: 2,
            borderColor: '#ffffff'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}`
            }
          }
        }
      }
    });
  }

  listEl.innerHTML = breakdown
    .slice(0, 6)
    .map(
      (item) => `
      <li class="breakdown-item">
        <span class="breakdown-label">
          <span class="breakdown-swatch" style="background-color: ${item.color}"></span>
          <span class="breakdown-name">${escapeHtml(item.category)}</span>
        </span>
        <span class="breakdown-value mono">
          <span>${formatCurrency(item.amount)}</span>
          <span class="breakdown-pct">${item.percentage.toFixed(0)}%</span>
        </span>
      </li>`
    )
    .join('');
}

function renderRecentTransactions(transactions) {
  const tbody = document.getElementById('dashboard-recent-tbody');
  const emptyEl = document.getElementById('dashboard-recent-empty');
  if (!tbody) return;

  const recent = sortTransactions(transactions, 'date-desc').slice(0, 6);
  if (recent.length === 0) {
    tbody.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  tbody.innerHTML = recent
    .map(
      (txn) => `
      <tr>
        <td class="mono cell-muted">${escapeHtml(formatDate(txn.date))}</td>
        <td class="cell-title">${escapeHtml(txn.title)}</td>
        <td class="cell-muted">${escapeHtml(txn.category)}</td>
        <td class="cell-desc" title="${escapeHtml(txn.description)}">${escapeHtml(txn.description || '—')}</td>
        <td class="text-right mono ${txn.type === 'income' ? 'text-income' : 'text-expense'}">
          ${txn.type === 'income' ? '+' : '-'}${formatCurrency(txn.amount)}
        </td>
      </tr>`
    )
    .join('');
}
