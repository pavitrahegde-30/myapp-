/**
 * analytics.js
 * Controls Feature 4: Expense Analytics — category-wise expense breakdown,
 * monthly income vs expenses, spending distribution, highest spending category,
 * total savings, and dynamic Chart.js visualizations.
 */

import { getTransactions } from './storage.js';
import {
  calculateTotals,
  getCategoryBreakdown,
  getMonthlyComparison,
  getMonthlyIncome,
  getMonthlySpending,
  formatCurrency,
  formatMonthLabel,
  escapeHtml
} from './transactions.js';

let monthlyChart = null;
let categoryBarChart = null;
let distributionChart = null;

/**
 * Renders the Expense Analytics view for the active month context.
 * @param {string} activeMonthKey
 */
export function renderAnalytics(activeMonthKey) {
  const transactions = getTransactions();
  const totals = calculateTotals(transactions);
  const monthLabel = formatMonthLabel(activeMonthKey);

  const monthIncome = getMonthlyIncome(transactions, activeMonthKey);
  const monthExpense = getMonthlySpending(transactions, activeMonthKey);
  const monthExpenseTxns = transactions.filter(
    (t) => t.type === 'expense' && String(t.date).startsWith(activeMonthKey)
  );
  const avgExpense = monthExpenseTxns.length > 0 ? monthExpense / monthExpenseTxns.length : 0;

  // All-time category breakdown for overall highest spending category, plus monthly breakdown
  const overallBreakdown = getCategoryBreakdown(transactions, 'expense');
  const topCategory = overallBreakdown[0] || null;

  // 1. Update Summary KPIs
  const savingsEl = document.getElementById('analytics-total-savings');
  const savingsRateEl = document.getElementById('analytics-savings-rate');
  const topCatEl = document.getElementById('analytics-top-category');
  const topCatAmtEl = document.getElementById('analytics-top-category-amount');
  const monthIncEl = document.getElementById('analytics-month-income');
  const monthLabelEl = document.getElementById('analytics-month-label');
  const monthExpEl = document.getElementById('analytics-month-expense');
  const avgExpEl = document.getElementById('analytics-avg-expense');
  const breakdownSubEl = document.getElementById('analytics-breakdown-subtitle');

  if (savingsEl) {
    savingsEl.textContent = formatCurrency(totals.totalBalance);
    savingsEl.className = `kpi-value mono ${totals.totalBalance >= 0 ? 'text-income' : 'text-expense'}`;
  }
  if (savingsRateEl) {
    savingsRateEl.textContent = `${totals.savingsRate.toFixed(1)}% of total income saved`;
  }
  if (topCatEl) {
    topCatEl.textContent = topCategory ? topCategory.category : '—';
  }
  if (topCatAmtEl) {
    topCatAmtEl.textContent = topCategory
      ? `${formatCurrency(topCategory.amount)} (${topCategory.percentage.toFixed(1)}% of expenses)`
      : '$0.00';
  }
  if (monthIncEl) monthIncEl.textContent = formatCurrency(monthIncome);
  if (monthLabelEl) monthLabelEl.textContent = monthLabel;
  if (monthExpEl) monthExpEl.textContent = formatCurrency(monthExpense);
  if (avgExpEl) {
    avgExpEl.textContent = `Avg ${formatCurrency(avgExpense)} / expense (${monthExpenseTxns.length})`;
  }
  if (breakdownSubEl) {
    breakdownSubEl.textContent = `All-time expense totals across ${overallBreakdown.length} categories`;
  }

  // 2. Render Dynamic Charts
  renderMonthlyIncomeVsExpenseChart(transactions, activeMonthKey);
  renderCategoryBarChart(overallBreakdown);
  renderSpendingDistribution(overallBreakdown);
}

function renderMonthlyIncomeVsExpenseChart(transactions, activeMonthKey) {
  const canvas = document.getElementById('analytics-monthly-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  const series = getMonthlyComparison(transactions, 6, activeMonthKey);
  if (monthlyChart) {
    monthlyChart.destroy();
  }

  monthlyChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.map((s) => s.label),
      datasets: [
        {
          label: 'Income',
          data: series.map((s) => s.income),
          backgroundColor: '#15803d',
          borderRadius: 4,
          barPercentage: 0.65,
          categoryPercentage: 0.6
        },
        {
          label: 'Expenses',
          data: series.map((s) => s.expenses),
          backgroundColor: '#b91c1c',
          borderRadius: 4,
          barPercentage: 0.65,
          categoryPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
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
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
            afterBody: (items) => {
              if (items.length >= 2) {
                const net = items[0].parsed.y - items[1].parsed.y;
                return `Net Savings: ${formatCurrency(net)}`;
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b', font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 } }
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

function renderCategoryBarChart(breakdown) {
  const canvas = document.getElementById('analytics-category-bar-chart');
  if (!canvas || typeof window.Chart === 'undefined') return;

  if (categoryBarChart) {
    categoryBarChart.destroy();
    categoryBarChart = null;
  }

  if (breakdown.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  categoryBarChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: breakdown.map((b) => b.category),
      datasets: [
        {
          label: 'Total Spent',
          data: breakdown.map((b) => b.amount),
          backgroundColor: breakdown.map((b) => b.color),
          borderRadius: 4,
          barThickness: 18
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${formatCurrency(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString()}`
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#334155',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '500' }
          }
        }
      }
    }
  });
}

function renderSpendingDistribution(breakdown) {
  const canvas = document.getElementById('analytics-distribution-chart');
  const tableEl = document.getElementById('analytics-distribution-table');
  if (!canvas || !tableEl) return;

  if (distributionChart) {
    distributionChart.destroy();
    distributionChart = null;
  }

  if (breakdown.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    tableEl.innerHTML = `<p class="kpi-meta">No expense data available yet.</p>`;
    return;
  }

  if (typeof window.Chart !== 'undefined') {
    distributionChart = new window.Chart(canvas, {
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
        cutout: '64%',
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

  tableEl.innerHTML = breakdown
    .map(
      (item) => `
      <div class="distribution-row">
        <span class="breakdown-label">
          <span class="breakdown-swatch" style="background-color: ${item.color}"></span>
          <span>${escapeHtml(item.category)}</span>
        </span>
        <span class="breakdown-value mono">
          <span>${formatCurrency(item.amount)}</span>
          <span class="breakdown-pct">${item.percentage.toFixed(1)}%</span>
        </span>
      </div>`
    )
    .join('');
}
