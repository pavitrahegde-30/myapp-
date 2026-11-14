/**
 * storage.js
 * Centralized data persistence layer for Ledgerly.
 * Connected to Node.js + Express + SQLite backend via REST API fetch() calls.
 */

const API_BASE = '';

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerly_transactions_v1',
  BUDGETS: 'ledgerly_budgets_v1',
  INITIALIZED: 'ledgerly_initialized_v1',
  MIGRATED: 'ledgerly_migrated_v1'
};

export const CATEGORIES = {
  expense: [
    'Food',
    'Housing',
    'Transport',
    'Utilities',
    'Healthcare',
    'Entertainment',
    'Shopping',
    'Education',
    'Other'
  ],
  income: [
    'Salary',
    'Freelance',
    'Investments',
    'Gifts',
    'Other'
  ]
};

// In-memory runtime cache populated by API responses
let _transactionsCache = [];
let _budgetsCache = {};

/**
 * Generates a unique transaction identifier (fallback).
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `txn_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `txn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Returns local YYYY-MM string with an optional month offset.
 * @param {number} offsetMonths
 * @returns {string}
 */
export function getLocalMonthKey(offsetMonths = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns local YYYY-MM-DD string for today.
 * @returns {string}
 */
export function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes a transaction record to enforce canonical schema.
 * @param {object} raw
 * @returns {object}
 */
function normalizeTransaction(raw) {
  return {
    id: raw.id !== undefined ? String(raw.id) : generateId(),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getTodayISO()),
    description: String(raw.description || '').trim()
  };
}

/**
 * Builds realistic initial demo transactions relative to current date.
 * @returns {Array<object>}
 */
function createDemoTransactions() {
  const m0 = getLocalMonthKey(0);
  const m1 = getLocalMonthKey(-1);
  const m2 = getLocalMonthKey(-2);
  const m3 = getLocalMonthKey(-3);
  const m4 = getLocalMonthKey(-4);
  const m5 = getLocalMonthKey(-5);

  const todayDay = String(Math.min(new Date().getDate(), 28)).padStart(2, '0');

  return [
    { id: 'txn_demo_01', title: 'Monthly Salary', amount: 5400, category: 'Salary', type: 'income', date: `${m0}-01`, description: 'Primary payroll direct deposit' },
    { id: 'txn_demo_02', title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${m0}-02`, description: 'Monthly lease payment' },
    { id: 'txn_demo_03', title: 'Grocery Shopping', amount: 320.5, category: 'Food', type: 'expense', date: `${m0}-05`, description: 'Weekly groceries and fresh produce' },
    { id: 'txn_demo_04', title: 'Electric & Fiber Internet', amount: 168.4, category: 'Utilities', type: 'expense', date: `${m0}-07`, description: 'Monthly electricity and home internet bill' },
    { id: 'txn_demo_05', title: 'UI Consulting Retainer', amount: 950, category: 'Freelance', type: 'income', date: `${m0}-09`, description: 'Client design system audit' },
    { id: 'txn_demo_06', title: 'Metro Pass & Fuel', amount: 142, category: 'Transport', type: 'expense', date: `${m0}-10`, description: 'Monthly transit pass and commuter fuel' },
    { id: 'txn_demo_07', title: 'Pharmacy & Dental Checkup', amount: 185, category: 'Healthcare', type: 'expense', date: `${m0}-11`, description: 'Routine dental cleaning and prescriptions' },
    { id: 'txn_demo_08', title: 'Neighborhood Bistro & Coffee', amount: 215.8, category: 'Food', type: 'expense', date: `${m0}-${todayDay}`, description: 'Dining out and weekly coffee beans' },
    { id: 'txn_demo_09', title: 'Monthly Salary', amount: 5400, category: 'Salary', type: 'income', date: `${m1}-01`, description: 'Primary payroll direct deposit' },
    { id: 'txn_demo_10', title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${m1}-02`, description: 'Monthly lease payment' },
    { id: 'txn_demo_11', title: 'Whole Foods & Market', amount: 495, category: 'Food', type: 'expense', date: `${m1}-08`, description: 'Household groceries' },
    { id: 'txn_demo_12', title: 'Utilities Bundle', amount: 175, category: 'Utilities', type: 'expense', date: `${m1}-12`, description: 'Water, electric, and internet' },
    { id: 'txn_demo_13', title: 'Running Shoes & Jacket', amount: 240, category: 'Shopping', type: 'expense', date: `${m1}-18`, description: 'Autumn athletic gear' },
    { id: 'txn_demo_14', title: 'Concert & Streaming', amount: 135, category: 'Entertainment', type: 'expense', date: `${m1}-22`, description: 'Live music tickets and subscriptions' },
    { id: 'txn_demo_15', title: 'Monthly Salary', amount: 5250, category: 'Salary', type: 'income', date: `${m2}-01`, description: 'Primary payroll direct deposit' },
    { id: 'txn_demo_16', title: 'Dividend Distribution', amount: 310, category: 'Investments', type: 'income', date: `${m2}-15`, description: 'Quarterly index fund dividend' },
    { id: 'txn_demo_17', title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${m2}-02`, description: 'Monthly lease payment' },
    { id: 'txn_demo_18', title: 'Groceries & Dining', amount: 540, category: 'Food', type: 'expense', date: `${m2}-14`, description: 'Monthly food expenses' },
    { id: 'txn_demo_19', title: 'Online Course Subscription', amount: 199, category: 'Education', type: 'expense', date: `${m2}-20`, description: 'Systems architecture workshop' },
    { id: 'txn_demo_20', title: 'Monthly Salary', amount: 5250, category: 'Salary', type: 'income', date: `${m3}-01`, description: 'Primary payroll direct deposit' },
    { id: 'txn_demo_21', title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${m3}-02`, description: 'Monthly lease payment' },
    { id: 'txn_demo_22', title: 'Groceries & Household', amount: 465, category: 'Food', type: 'expense', date: `${m3}-11`, description: 'Weekly supermarket runs' },
    { id: 'txn_demo_23', title: 'Train Tickets & Rideshare', amount: 210, category: 'Transport', type: 'expense', date: `${m3}-19`, description: 'Regional rail travel' },
    { id: 'txn_demo_24', title: 'Monthly Salary', amount: 5250, category: 'Salary', type: 'income', date: `${m4}-01`, description: 'Primary payroll direct deposit' },
    { id: 'txn_demo_25', title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${m4}-02`, description: 'Monthly lease payment' },
    { id: 'txn_demo_26', title: 'Summer Travel & Lodging', amount: 680, category: 'Entertainment', type: 'expense', date: `${m4}-16`, description: 'Weekend coastal trip' },
    { id: 'txn_demo_27', title: 'Groceries', amount: 430, category: 'Food', type: 'expense', date: `${m4}-21`, description: 'Supermarket purchases' },
    { id: 'txn_demo_28', title: 'Monthly Salary', amount: 5100, category: 'Salary', type: 'income', date: `${m5}-01`, description: 'Primary payroll direct deposit' },
    { id: 'txn_demo_29', title: 'Apartment Rent', amount: 1450, category: 'Housing', type: 'expense', date: `${m5}-02`, description: 'Monthly lease payment' },
    { id: 'txn_demo_30', title: 'Groceries & Utilities', amount: 590, category: 'Food', type: 'expense', date: `${m5}-12`, description: 'Food and monthly utilities' }
  ].map(normalizeTransaction);
}

/**
 * Initial setup helper: ensures flags are set without injecting synthetic demo data.
 */
export function seedInitialDataIfNeeded() {
  try {
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
    // Clear any leftover demo keys in LocalStorage to keep client storage clean
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.BUDGETS);
  } catch (err) {
    console.error('Storage initialization flag error:', err);
  }
}

/**
 * Migration helper: bypassed now that SQLite is the active source of truth.
 */
export async function migrateLocalStorageIfNeeded() {
  localStorage.setItem(STORAGE_KEYS.MIGRATED, 'true');
  return { migrated: false, alreadyDone: true };
}

/**
 * Fetches all transactions from the REST API and updates in-memory cache.
 * @returns {Promise<Array<object>>}
 */
export async function fetchTransactions() {
  const res = await fetch(`${API_BASE}/api/transactions`);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch transactions (HTTP ${res.status})`);
  }
  const result = await res.json();
  _transactionsCache = Array.isArray(result.data) ? result.data.map(normalizeTransaction) : [];
  return _transactionsCache;
}

/**
 * Returns current cached transactions.
 * @returns {Array<object>}
 */
export function getTransactions() {
  return _transactionsCache;
}

/**
 * Preserved for backwards compatibility.
 */
export function saveTransactions(transactions) {
  _transactionsCache = Array.isArray(transactions) ? transactions.map(normalizeTransaction) : [];
}

/**
 * Creates and persists a new transaction via REST API.
 * @param {object} transactionInput
 * @returns {Promise<object>}
 */
export async function addTransaction(transactionInput) {
  const res = await fetch(`${API_BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: transactionInput.title,
      amount: transactionInput.amount,
      category: transactionInput.category,
      type: transactionInput.type,
      date: transactionInput.date,
      description: transactionInput.description || ''
    })
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to create transaction (HTTP ${res.status})`);
  }

  const result = await res.json();
  const created = normalizeTransaction(result.data);
  _transactionsCache.unshift(created);
  return created;
}

/**
 * Updates an existing transaction by ID via REST API.
 * @param {string|number} id
 * @param {object} updatedFields
 * @returns {Promise<object>}
 */
export async function updateTransaction(id, updatedFields) {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedFields)
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to update transaction (HTTP ${res.status})`);
  }

  const result = await res.json();
  const updated = normalizeTransaction(result.data);
  const idx = _transactionsCache.findIndex((t) => String(t.id) === String(id));
  if (idx !== -1) {
    _transactionsCache[idx] = updated;
  }
  return updated;
}

/**
 * Deletes a transaction by ID via REST API.
 * @param {string|number} id
 * @returns {Promise<boolean>}
 */
export async function deleteTransaction(id) {
  const res = await fetch(`${API_BASE}/api/transactions/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to delete transaction (HTTP ${res.status})`);
  }

  _transactionsCache = _transactionsCache.filter((t) => String(t.id) !== String(id));
  return true;
}

/**
 * Fetches the budget for a specific month (YYYY-MM) from REST API.
 * @param {string} monthKey
 * @returns {Promise<number>}
 */
export async function fetchBudgetForMonth(monthKey) {
  if (!monthKey || monthKey === 'all') return 0;
  const [yStr, mStr] = monthKey.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  if (!year || !month) return 0;

  const res = await fetch(`${API_BASE}/api/budgets/${year}/${month}`);
  if (res.status === 404) {
    _budgetsCache[monthKey] = null;
    return 0;
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch budget for ${monthKey}`);
  }

  const result = await res.json();
  _budgetsCache[monthKey] = result.data;
  return result.data ? Number(result.data.amount) || 0 : 0;
}

/**
 * Returns cached budget amount for a specific YYYY-MM month.
 * @param {string} monthKey
 * @returns {number}
 */
export function getBudgetAmountForMonth(monthKey) {
  const budget = _budgetsCache[monthKey];
  if (budget && typeof budget.amount === 'number') {
    return budget.amount;
  }
  return 0;
}

/**
 * Saves or updates budget for a specific month via REST API.
 * @param {string} monthKey
 * @param {number} amount
 * @returns {Promise<object>}
 */
export async function saveBudgetForMonth(monthKey, amount) {
  const [yStr, mStr] = monthKey.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const numericAmount = Number(Number(amount).toFixed(2));

  const existing = _budgetsCache[monthKey];
  let res;

  if (existing && existing.id) {
    res = await fetch(`${API_BASE}/api/budgets/${existing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: numericAmount })
    });
  } else {
    res = await fetch(`${API_BASE}/api/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, amount: numericAmount })
    });

    if (res.status === 409) {
      const conflict = await res.json();
      if (conflict.data && conflict.data.id) {
        res = await fetch(`${API_BASE}/api/budgets/${conflict.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: numericAmount })
        });
      }
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to save monthly budget (HTTP ${res.status})`);
  }

  const result = await res.json();
  _budgetsCache[monthKey] = result.data;
  return result.data;
}

/**
 * Preserved for backwards compatibility.
 */
export function getBudget() {
  const byMonth = {};
  for (const [k, v] of Object.entries(_budgetsCache)) {
    if (v && v.amount !== undefined) {
      byMonth[k] = v.amount;
    }
  }
  return { defaultAmount: 0, byMonth };
}

export function saveBudget(budgetData) {
  return getBudget();
}

/**
 * Preserved demo reset action: seeds demo data into LocalStorage and re-migrates.
 */
export async function resetDemoData() {
  localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
  localStorage.removeItem(STORAGE_KEYS.MIGRATED);
  seedInitialDataIfNeeded();
  await migrateLocalStorageIfNeeded();
  await fetchTransactions();
}
