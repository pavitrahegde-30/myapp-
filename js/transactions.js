/**
 * transactions.js
 * Pure financial calculation helpers (storage-independent for future REST API parity)
 * plus Transaction History view rendering and Add/Edit Transaction form handlers.
 */

import {
  CATEGORIES,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getTodayISO,
  getLocalMonthKey
} from './storage.js';

export const CATEGORY_COLORS = {
  Food: '#0f766e',
  Housing: '#1e293b',
  Transport: '#0284c7',
  Utilities: '#d97706',
  Healthcare: '#dc2626',
  Entertainment: '#7c3aed',
  Shopping: '#db2777',
  Education: '#2563eb',
  Other: '#64748b',
  Salary: '#15803d',
  Freelance: '#0d9488',
  Investments: '#0369a1',
  Gifts: '#9333ea'
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Formats a numeric value as USD currency.
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const safe = Number.isFinite(amount) ? amount : 0;
  return currencyFormatter.format(safe);
}

/**
 * Formats YYYY-MM-DD safely in local time without UTC shift.
 * @param {string} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '—';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Formats YYYY-MM into readable label e.g. "November 2026".
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'all') return 'All Time';
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Formats YYYY-MM into short chart axis label e.g. "Nov 26".
 * @param {string} monthKey
 * @returns {string}
 */
export function formatShortMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/**
 * Escapes HTML special characters to prevent XSS in template strings.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   Pure Financial Calculation Functions (Storage-Independent)
   ========================================================================== */

/**
 * Computes total income, total expenses, total balance, and savings rate.
 * @param {Array<object>} transactions
 */
export function calculateTotals(transactions) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const txn of transactions) {
    const amt = Number(txn.amount) || 0;
    if (txn.type === 'income') {
      totalIncome += amt;
      incomeCount += 1;
    } else {
      totalExpenses += amt;
      expenseCount += 1;
    }
  }

  const totalBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  return {
    totalIncome,
    totalExpenses,
    totalBalance,
    savingsRate,
    incomeCount,
    expenseCount
  };
}

/**
 * Filters transactions by search text, category, type, and optional month (YYYY-MM).
 * @param {Array<object>} transactions
 * @param {{ search?: string, category?: string, type?: string, month?: string }} filters
 */
export function filterTransactions(transactions, filters = {}) {
  const search = (filters.search || '').trim().toLowerCase();
  const category = filters.category || 'all';
  const type = filters.type || 'all';
  const month = filters.month || 'all';

  return transactions.filter((txn) => {
    if (month !== 'all' && !String(txn.date).startsWith(month)) {
      return false;
    }
    if (type !== 'all' && txn.type !== type) {
      return false;
    }
    if (category !== 'all' && txn.category !== category) {
      return false;
    }
    if (search) {
      const haystack = `${txn.title} ${txn.category} ${txn.description}`.toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Sorts a copy of transactions according to the specified sort key.
 * @param {Array<object>} transactions
 * @param {string} sortOrder
 */
export function sortTransactions(transactions, sortOrder = 'date-desc') {
  const copy = [...transactions];
  copy.sort((a, b) => {
    if (sortOrder === 'date-asc') {
      return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    }
    if (sortOrder === 'amount-desc') {
      return b.amount - a.amount || b.date.localeCompare(a.date);
    }
    if (sortOrder === 'amount-asc') {
      return a.amount - b.amount || b.date.localeCompare(a.date);
    }
    // Default: newest first
    return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
  });
  return copy;
}

/**
 * Computes total spending (expenses) for a specific YYYY-MM month.
 * @param {Array<object>} transactions
 * @param {string} monthKey
 * @returns {number}
 */
export function getMonthlySpending(transactions, monthKey) {
  return transactions
    .filter((txn) => txn.type === 'expense' && String(txn.date).startsWith(monthKey))
    .reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0);
}

/**
 * Computes total income for a specific YYYY-MM month.
 * @param {Array<object>} transactions
 * @param {string} monthKey
 * @returns {number}
 */
export function getMonthlyIncome(transactions, monthKey) {
  return transactions
    .filter((txn) => txn.type === 'income' && String(txn.date).startsWith(monthKey))
    .reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0);
}

/**
 * Computes category-wise totals sorted descending by amount.
 * @param {Array<object>} transactions
 * @param {'expense'|'income'} type
 */
export function getCategoryBreakdown(transactions, type = 'expense') {
  const map = new Map();
  let grandTotal = 0;

  for (const txn of transactions) {
    if (txn.type !== type) continue;
    const amt = Number(txn.amount) || 0;
    grandTotal += amt;
    map.set(txn.category, (map.get(txn.category) || 0) + amt);
  }

  return Array.from(map.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: grandTotal > 0 ? (amount / grandTotal) * 100 : 0,
      color: CATEGORY_COLORS[category] || '#64748b'
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Returns chronological monthly income vs expense totals for the last N months
 * ending at anchorMonthKey (YYYY-MM).
 * @param {Array<object>} transactions
 * @param {number} monthsCount
 * @param {string} anchorMonthKey
 */
export function getMonthlyComparison(transactions, monthsCount = 6, anchorMonthKey = getLocalMonthKey(0)) {
  const [anchorY, anchorM] = anchorMonthKey.split('-').map(Number);
  const baseDate =
    anchorY && anchorM ? new Date(anchorY, anchorM - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const buckets = [];
  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      monthKey: key,
      label: formatShortMonthLabel(key),
      income: 0,
      expenses: 0
    });
  }

  const bucketMap = new Map(buckets.map((b) => [b.monthKey, b]));
  for (const txn of transactions) {
    const key = String(txn.date || '').slice(0, 7);
    const target = bucketMap.get(key);
    if (!target) continue;
    if (txn.type === 'income') {
      target.income += Number(txn.amount) || 0;
    } else {
      target.expenses += Number(txn.amount) || 0;
    }
  }

  return buckets;
}

/**
 * Validates transaction input fields and returns structured errors.
 * @param {object} data
 */
export function validateTransactionInput(data) {
  const errors = {};
  const title = String(data.title || '').trim();
  const amount = Number(data.amount);
  const category = String(data.category || '').trim();
  const date = String(data.date || '').trim();
  const type = data.type;

  if (!title) {
    errors.title = 'Please enter a transaction title.';
  } else if (title.length < 2) {
    errors.title = 'Title must be at least 2 characters.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (amount > 100000000) {
    errors.amount = 'Amount exceeds maximum limit.';
  }

  if (!category) {
    errors.category = 'Please select a category.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Select a valid date.';
  }

  if (type !== 'income' && type !== 'expense') {
    errors.type = 'Select income or expense.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/* ==========================================================================
   Transaction History & Form Controller
   ========================================================================== */

const historyState = {
  search: '',
  type: 'all',
  category: 'all',
  sort: 'date-desc'
};

let appCallbacks = {
  onDataChange: () => {},
  showToast: () => {},
  openConfirm: () => {}
};

/**
 * Populates a <select> element with categories matching the transaction type.
 * @param {HTMLSelectElement} selectEl
 * @param {'expense'|'income'|'all'} type
 * @param {string} selectedValue
 */
export function populateCategorySelect(selectEl, type, selectedValue = '') {
  if (!selectEl) return;
  let options = [];

  if (type === 'all') {
    const combined = Array.from(new Set([...CATEGORIES.expense, ...CATEGORIES.income]));
    options = ['all', ...combined];
  } else {
    options = CATEGORIES[type] || CATEGORIES.expense;
  }

  selectEl.innerHTML = options
    .map((cat) => {
      if (cat === 'all') {
        return `<option value="all">All Categories</option>`;
      }
      return `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
    })
    .join('');

  if (selectedValue && options.includes(selectedValue)) {
    selectEl.value = selectedValue;
  } else {
    selectEl.value = options[0];
  }
}

/**
 * Initializes event listeners for Transaction History, Inline Form, and Modal Form.
 * @param {object} callbacks
 */
export function initTransactionsModule(callbacks) {
  appCallbacks = { ...appCallbacks, ...callbacks };

  // 1. History Filter Controls
  const searchInput = document.getElementById('history-search-input');
  const typeGroup = document.getElementById('history-type-filter');
  const categorySelect = document.getElementById('history-category-filter');
  const sortSelect = document.getElementById('history-sort-select');
  const clearFiltersBtn = document.getElementById('history-clear-filters-btn');
  const historyTbody = document.getElementById('history-tbody');

  populateCategorySelect(categorySelect, 'all', 'all');

  searchInput?.addEventListener('input', (e) => {
    historyState.search = e.target.value;
    renderTransactionHistory();
  });

  typeGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type-filter]');
    if (!btn) return;
    historyState.type = btn.dataset.typeFilter;
    typeGroup.querySelectorAll('.segment-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    renderTransactionHistory();
  });

  categorySelect?.addEventListener('change', (e) => {
    historyState.category = e.target.value;
    renderTransactionHistory();
  });

  sortSelect?.addEventListener('change', (e) => {
    historyState.sort = e.target.value;
    renderTransactionHistory();
  });

  clearFiltersBtn?.addEventListener('click', () => {
    historyState.search = '';
    historyState.type = 'all';
    historyState.category = 'all';
    historyState.sort = 'date-desc';

    if (searchInput) searchInput.value = '';
    if (categorySelect) categorySelect.value = 'all';
    if (sortSelect) sortSelect.value = 'date-desc';
    typeGroup?.querySelectorAll('.segment-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.typeFilter === 'all');
    });
    renderTransactionHistory();
  });

  // Delegated Edit / Delete buttons in History table
  historyTbody?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-id]');
    if (editBtn) {
      openTransactionModal(editBtn.dataset.editId);
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-id]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.deleteId;
      const txn = getTransactions().find((t) => t.id === id);
      const label = txn ? `"${txn.title}"` : 'this transaction';
      appCallbacks.openConfirm(`Are you sure you want to delete ${label}? This action cannot be undone.`, () => {
        if (deleteTransaction(id)) {
          appCallbacks.showToast('Transaction deleted', 'success');
          appCallbacks.onDataChange();
        }
      });
    }
  });

  // 2. Inline Add Transaction Form (Feature 2 View)
  setupInlineForm();

  // 3. Modal Add/Edit Form
  setupModalForm();
}

function setupInlineForm() {
  const form = document.getElementById('inline-transaction-form');
  if (!form) return;

  const typeInput = document.getElementById('inline-type');
  const dateInput = document.getElementById('inline-date');
  const titleInput = document.getElementById('inline-title');
  const amountInput = document.getElementById('inline-amount');
  const categorySelect = document.getElementById('inline-category');
  const descInput = document.getElementById('inline-description');
  const resetBtn = document.getElementById('inline-reset-btn');
  const typeButtons = form.querySelectorAll('[data-type-option]');

  dateInput.value = getTodayISO();
  populateCategorySelect(categorySelect, 'expense');

  const clearInlineErrors = () => {
    ['inline-date', 'inline-title', 'inline-amount', 'inline-category', 'inline-description'].forEach((id) => {
      document.getElementById(id)?.classList.remove('invalid');
    });
    ['inline-date-error', 'inline-title-error', 'inline-amount-error', 'inline-category-error', 'inline-description-error'].forEach(
      (id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      }
    );
  };

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const selectedType = btn.dataset.typeOption;
      typeInput.value = selectedType;
      typeButtons.forEach((b) => b.classList.toggle('active', b === btn));
      populateCategorySelect(categorySelect, selectedType);
      updateInlinePreview();
    });
  });

  amountInput.addEventListener('input', updateInlinePreview);

  resetBtn?.addEventListener('click', () => {
    setTimeout(() => {
      typeInput.value = 'expense';
      typeButtons.forEach((b) => b.classList.toggle('active', b.dataset.typeOption === 'expense'));
      populateCategorySelect(categorySelect, 'expense');
      dateInput.value = getTodayISO();
      clearInlineErrors();
      updateInlinePreview();
    }, 0);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearInlineErrors();

    const payload = {
      type: typeInput.value,
      date: dateInput.value,
      title: titleInput.value,
      amount: amountInput.value,
      category: categorySelect.value,
      description: descInput.value
    };

    const { valid, errors } = validateTransactionInput(payload);
    if (!valid) {
      if (errors.date) {
        dateInput.classList.add('invalid');
        document.getElementById('inline-date-error').textContent = errors.date;
      }
      if (errors.title) {
        titleInput.classList.add('invalid');
        document.getElementById('inline-title-error').textContent = errors.title;
      }
      if (errors.amount) {
        amountInput.classList.add('invalid');
        document.getElementById('inline-amount-error').textContent = errors.amount;
      }
      if (errors.category) {
        categorySelect.classList.add('invalid');
        document.getElementById('inline-category-error').textContent = errors.category;
      }
      return;
    }

    addTransaction(payload);
    form.reset();
    typeInput.value = 'expense';
    typeButtons.forEach((b) => b.classList.toggle('active', b.dataset.typeOption === 'expense'));
    populateCategorySelect(categorySelect, 'expense');
    dateInput.value = getTodayISO();
    appCallbacks.showToast(`${payload.type === 'income' ? 'Income' : 'Expense'} added`, 'success');
    appCallbacks.onDataChange();
  });
}

function setupModalForm() {
  const modal = document.getElementById('txn-modal');
  const form = document.getElementById('modal-transaction-form');
  if (!modal || !form) return;

  const closeBtn = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const typeInput = document.getElementById('modal-type');
  const categorySelect = document.getElementById('modal-category');
  const typeButtons = form.querySelectorAll('[data-modal-type]');

  const closeModal = () => {
    modal.classList.add('hidden');
  };

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextType = btn.dataset.modalType;
      typeInput.value = nextType;
      typeButtons.forEach((b) => b.classList.toggle('active', b === btn));
      populateCategorySelect(categorySelect, nextType);
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearModalErrors();

    const id = document.getElementById('modal-txn-id').value;
    const payload = {
      type: typeInput.value,
      date: document.getElementById('modal-date').value,
      title: document.getElementById('modal-title-input').value,
      amount: document.getElementById('modal-amount').value,
      category: categorySelect.value,
      description: document.getElementById('modal-description').value
    };

    const { valid, errors } = validateTransactionInput(payload);
    if (!valid) {
      if (errors.date) {
        document.getElementById('modal-date').classList.add('invalid');
        document.getElementById('modal-date-error').textContent = errors.date;
      }
      if (errors.title) {
        document.getElementById('modal-title-input').classList.add('invalid');
        document.getElementById('modal-title-error').textContent = errors.title;
      }
      if (errors.amount) {
        document.getElementById('modal-amount').classList.add('invalid');
        document.getElementById('modal-amount-error').textContent = errors.amount;
      }
      if (errors.category) {
        categorySelect.classList.add('invalid');
        document.getElementById('modal-category-error').textContent = errors.category;
      }
      return;
    }

    if (id) {
      updateTransaction(id, payload);
      appCallbacks.showToast('Transaction updated', 'success');
    } else {
      addTransaction(payload);
      appCallbacks.showToast(`${payload.type === 'income' ? 'Income' : 'Expense'} added`, 'success');
    }

    closeModal();
    appCallbacks.onDataChange();
  });
}

function clearModalErrors() {
  ['modal-date', 'modal-title-input', 'modal-amount', 'modal-category', 'modal-description'].forEach((id) => {
    document.getElementById(id)?.classList.remove('invalid');
  });
  ['modal-date-error', 'modal-title-error', 'modal-amount-error', 'modal-category-error', 'modal-description-error'].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    }
  );
}

/**
 * Opens the Add/Edit Transaction Modal. Pass an ID to edit an existing entry.
 * @param {string|null} editId
 */
export function openTransactionModal(editId = null) {
  const modal = document.getElementById('txn-modal');
  const form = document.getElementById('modal-transaction-form');
  const titleEl = document.getElementById('modal-title');
  const submitBtn = document.getElementById('modal-submit-btn');
  const idInput = document.getElementById('modal-txn-id');
  const typeInput = document.getElementById('modal-type');
  const dateInput = document.getElementById('modal-date');
  const titleInput = document.getElementById('modal-title-input');
  const amountInput = document.getElementById('modal-amount');
  const categorySelect = document.getElementById('modal-category');
  const descInput = document.getElementById('modal-description');
  const typeButtons = form.querySelectorAll('[data-modal-type]');

  clearModalErrors();

  if (editId) {
    const existing = getTransactions().find((t) => t.id === editId);
    if (!existing) return;

    titleEl.textContent = 'Edit Transaction';
    submitBtn.textContent = 'Update Transaction';
    idInput.value = existing.id;
    typeInput.value = existing.type;
    typeButtons.forEach((b) => b.classList.toggle('active', b.dataset.modalType === existing.type));
    populateCategorySelect(categorySelect, existing.type, existing.category);
    dateInput.value = existing.date;
    titleInput.value = existing.title;
    amountInput.value = String(existing.amount);
    descInput.value = existing.description;
  } else {
    titleEl.textContent = 'Add Transaction';
    submitBtn.textContent = 'Save Transaction';
    idInput.value = '';
    typeInput.value = 'expense';
    typeButtons.forEach((b) => b.classList.toggle('active', b.dataset.modalType === 'expense'));
    populateCategorySelect(categorySelect, 'expense');
    dateInput.value = getTodayISO();
    titleInput.value = '';
    amountInput.value = '';
    descInput.value = '';
  }

  modal.classList.remove('hidden');
  titleInput.focus();
}

/**
 * Updates the live balance impact preview on the Add Transaction view.
 */
export function updateInlinePreview() {
  const transactions = getTransactions();
  const { totalBalance } = calculateTotals(transactions);

  const type = document.getElementById('inline-type')?.value || 'expense';
  const rawAmount = parseFloat(document.getElementById('inline-amount')?.value || '0');
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
  const delta = type === 'income' ? amount : -amount;
  const projected = totalBalance + delta;

  const currentEl = document.getElementById('preview-current-balance');
  const impactEl = document.getElementById('preview-entry-impact');
  const projectedEl = document.getElementById('preview-projected-balance');

  if (currentEl) currentEl.textContent = formatCurrency(totalBalance);
  if (impactEl) {
    impactEl.textContent = `${delta >= 0 ? '+' : '-'}${formatCurrency(Math.abs(delta))}`;
    impactEl.className = `mono ${delta > 0 ? 'text-income' : delta < 0 ? 'text-expense' : ''}`;
  }
  if (projectedEl) {
    projectedEl.textContent = formatCurrency(projected);
    projectedEl.className = `mono ${projected < 0 ? 'text-expense' : ''}`;
  }

  // Render 4 latest entries in sidebar preview
  const recentList = document.getElementById('inline-recent-added');
  if (!recentList) return;

  const recent = sortTransactions(transactions, 'date-desc').slice(0, 4);
  if (recent.length === 0) {
    recentList.innerHTML = `<li class="mini-txn-meta">No entries yet.</li>`;
    return;
  }

  recentList.innerHTML = recent
    .map(
      (txn) => `
      <li class="mini-txn-item">
        <div class="mini-txn-info">
          <div class="mini-txn-title">${escapeHtml(txn.title)}</div>
          <div class="mini-txn-meta">${escapeHtml(txn.category)} · ${escapeHtml(formatDate(txn.date))}</div>
        </div>
        <span class="mono ${txn.type === 'income' ? 'text-income' : 'text-expense'}">
          ${txn.type === 'income' ? '+' : '-'}${formatCurrency(txn.amount)}
        </span>
      </li>`
    )
    .join('');
}

/**
 * Renders the Transaction History table based on active filters and sort order.
 */
export function renderTransactionHistory() {
  const tbody = document.getElementById('history-tbody');
  const emptyState = document.getElementById('history-empty-state');
  const countLabel = document.getElementById('history-count-label');
  const netLabel = document.getElementById('history-filtered-net');
  if (!tbody) return;

  const all = getTransactions();
  const filtered = filterTransactions(all, {
    search: historyState.search,
    type: historyState.type,
    category: historyState.category
  });
  const sorted = sortTransactions(filtered, historyState.sort);
  const { totalBalance } = calculateTotals(sorted);

  if (countLabel) {
    countLabel.textContent = `${sorted.length} ${sorted.length === 1 ? 'transaction' : 'transactions'}`;
  }
  if (netLabel) {
    netLabel.textContent = formatCurrency(totalBalance);
    netLabel.className = `mono ${totalBalance >= 0 ? 'text-income' : 'text-expense'}`;
  }

  if (sorted.length === 0) {
    tbody.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  tbody.innerHTML = sorted
    .map(
      (txn) => `
      <tr>
        <td class="mono cell-muted">${escapeHtml(formatDate(txn.date))}</td>
        <td class="cell-title">${escapeHtml(txn.title)}</td>
        <td class="cell-muted">${escapeHtml(txn.category)}</td>
        <td class="cell-muted">${txn.type === 'income' ? 'Income' : 'Expense'}</td>
        <td class="cell-desc" title="${escapeHtml(txn.description)}">${escapeHtml(txn.description || '—')}</td>
        <td class="text-right mono ${txn.type === 'income' ? 'text-income' : 'text-expense'}">
          ${txn.type === 'income' ? '+' : '-'}${formatCurrency(txn.amount)}
        </td>
        <td class="text-right">
          <div class="table-actions">
            <button
              type="button"
              class="icon-btn"
              data-edit-id="${escapeHtml(txn.id)}"
              aria-label="Edit ${escapeHtml(txn.title)}"
              title="Edit transaction"
            >
              <i data-lucide="pencil"></i>
            </button>
            <button
              type="button"
              class="icon-btn icon-btn-danger"
              data-delete-id="${escapeHtml(txn.id)}"
              aria-label="Delete ${escapeHtml(txn.title)}"
              title="Delete transaction"
            >
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>`
    )
    .join('');

  if (window.lucide) {
    window.lucide.createIcons();
  }
}
