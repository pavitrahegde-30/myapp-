/**
 * app.js
 * Application entry point and view coordinator.
 * Wires navigation, active month selection, global modals, toasts, and reactive re-rendering.
 */

import {
  seedInitialDataIfNeeded,
  resetDemoData,
  getTransactions,
  getLocalMonthKey
} from './storage.js';
import {
  initTransactionsModule,
  openTransactionModal,
  renderTransactionHistory,
  updateInlinePreview,
  formatMonthLabel
} from './transactions.js';
import { renderDashboard } from './dashboard.js';
import { renderAnalytics } from './analytics.js';
import { initBudgetModule, renderBudget } from './budget.js';

const VIEW_META = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Financial overview and monthly activity'
  },
  'add-transaction': {
    title: 'Add Transaction',
    subtitle: 'Record new income or expense entries'
  },
  transactions: {
    title: 'Transaction History',
    subtitle: 'Search, filter, edit, and manage all recorded entries'
  },
  analytics: {
    title: 'Expense Analytics',
    subtitle: 'Category breakdowns, cashflow trends, and savings insights'
  },
  budget: {
    title: 'Budget Management',
    subtitle: 'Set monthly spending targets and monitor utilization alerts'
  }
};

const appState = {
  activeView: 'dashboard',
  activeMonth: getLocalMonthKey(0)
};

let confirmHandler = null;

function init() {
  seedInitialDataIfNeeded();

  populateMonthSelector();
  setupNavigation();
  setupMobileSidebar();
  setupConfirmModal();
  setupGlobalActions();

  initTransactionsModule({
    onDataChange: refreshAllViews,
    showToast,
    openConfirm
  });

  initBudgetModule({
    getActiveMonth: () => appState.activeMonth,
    onDataChange: refreshAllViews,
    showToast
  });

  // Handle URL hash route on load if present
  const initialHash = window.location.hash.replace('#', '');
  if (VIEW_META[initialHash]) {
    switchView(initialHash);
  } else {
    refreshAllViews();
  }
}

function populateMonthSelector() {
  const select = document.getElementById('active-month-select');
  if (!select) return;

  const transactions = getTransactions();
  const monthsSet = new Set([getLocalMonthKey(0)]);

  for (let i = 1; i <= 5; i += 1) {
    monthsSet.add(getLocalMonthKey(-i));
  }

  for (const txn of transactions) {
    const m = String(txn.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) {
      monthsSet.add(m);
    }
  }

  const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  if (!sortedMonths.includes(appState.activeMonth)) {
    appState.activeMonth = sortedMonths[0];
  }

  select.innerHTML = sortedMonths
    .map((m) => `<option value="${m}">${formatMonthLabel(m)}</option>`)
    .join('');

  select.value = appState.activeMonth;

  if (!select.dataset.bound) {
    select.addEventListener('change', (e) => {
      appState.activeMonth = e.target.value;
      refreshAllViews();
    });
    select.dataset.bound = 'true';
  }
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-link[data-view]');
  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      closeMobileSidebar();
    });
  });

  document.querySelector('[data-nav="dashboard"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('dashboard');
    closeMobileSidebar();
  });

  document.getElementById('view-all-txns-btn')?.addEventListener('click', () => {
    switchView('transactions');
  });
}

function switchView(viewName) {
  if (!VIEW_META[viewName]) return;
  appState.activeView = viewName;

  document.querySelectorAll('.nav-link[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  if (titleEl) titleEl.textContent = VIEW_META[viewName].title;
  if (subtitleEl) subtitleEl.textContent = VIEW_META[viewName].subtitle;

  window.history.replaceState(null, '', `#${viewName}`);
  refreshActiveView();
}

function setupMobileSidebar() {
  const openBtn = document.getElementById('sidebar-open-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const backdrop = document.getElementById('sidebar-backdrop');

  openBtn?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
    backdrop?.classList.add('open');
  });

  closeBtn?.addEventListener('click', closeMobileSidebar);
  backdrop?.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}

function setupGlobalActions() {
  document.getElementById('topbar-add-btn')?.addEventListener('click', () => {
    openTransactionModal(null);
  });

  document.querySelectorAll('[data-action="open-add-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => openTransactionModal(null));
  });

  document.getElementById('reset-demo-btn')?.addEventListener('click', () => {
    openConfirm(
      'Reset all transactions and budget settings back to the initial sample dataset?',
      () => {
        resetDemoData();
        appState.activeMonth = getLocalMonthKey(0);
        populateMonthSelector();
        refreshAllViews();
        showToast('Demo data restored', 'success');
      },
      'Reset Demo Data',
      'Reset Data'
    );
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('txn-modal')?.classList.add('hidden');
      document.getElementById('confirm-modal')?.classList.add('hidden');
      closeMobileSidebar();
    }
  });
}

function setupConfirmModal() {
  const modal = document.getElementById('confirm-modal');
  const closeBtn = document.getElementById('confirm-close-btn');
  const cancelBtn = document.getElementById('confirm-cancel-btn');
  const acceptBtn = document.getElementById('confirm-accept-btn');

  const close = () => {
    modal?.classList.add('hidden');
    confirmHandler = null;
  };

  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  acceptBtn?.addEventListener('click', () => {
    const fn = confirmHandler;
    close();
    if (typeof fn === 'function') fn();
  });
}

function openConfirm(message, onConfirm, title = 'Confirm Action', actionLabel = 'Delete') {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-message');
  const acceptBtn = document.getElementById('confirm-accept-btn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (acceptBtn) acceptBtn.textContent = actionLabel;
  confirmHandler = onConfirm;

  modal?.classList.remove('hidden');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const iconName = type === 'success' ? 'check-circle-2' : 'alert-circle';
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span></span>`;
  toast.querySelector('span').textContent = message;

  container.appendChild(toast);
  if (window.lucide) {
    window.lucide.createIcons();
  }

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function refreshActiveView() {
  // Always keep sidebar budget widget and month selector up to date
  populateMonthSelector();
  renderBudget(appState.activeMonth);

  if (appState.activeView === 'dashboard') {
    renderDashboard(appState.activeMonth);
  } else if (appState.activeView === 'add-transaction') {
    updateInlinePreview();
  } else if (appState.activeView === 'transactions') {
    renderTransactionHistory();
  } else if (appState.activeView === 'analytics') {
    renderAnalytics(appState.activeMonth);
  } else if (appState.activeView === 'budget') {
    renderBudget(appState.activeMonth);
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function refreshAllViews() {
  populateMonthSelector();
  renderDashboard(appState.activeMonth);
  updateInlinePreview();
  renderTransactionHistory();
  renderAnalytics(appState.activeMonth);
  renderBudget(appState.activeMonth);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

document.addEventListener('DOMContentLoaded', init);
