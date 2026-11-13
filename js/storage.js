/**
 * storage.js
 * Centralized persistence module using LocalStorage.
 * Designed with clean repository boundaries so LocalStorage calls can be
 * replaced with async REST API (fetch) calls during backend integration.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerly_transactions_v1',
  BUDGETS: 'ledgerly_budgets_v1',
  INITIALIZED: 'ledgerly_initialized_v1'
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

/**
 * Generates a unique transaction identifier.
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
 * Normalizes a transaction record to enforce the canonical schema.
 * @param {object} raw
 * @returns {object}
 */
function normalizeTransaction(raw) {
  return {
    id: String(raw.id || generateId()),
    title: String(raw.title || '').trim(),
    amount: Number(Number(raw.amount || 0).toFixed(2)),
    category: String(raw.category || 'Other').trim(),
    type: raw.type === 'income' ? 'income' : 'expense',
    date: String(raw.date || getTodayISO()),
    description: String(raw.description || '').trim()
  };
}

/**
 * Builds realistic initial demo transactions relative to the current date
 * so Dashboard, Analytics, and Budget views work immediately on first visit.
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
    // Current month (m0)
    {
      id: 'txn_demo_01',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m0}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'txn_demo_02',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m0}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'txn_demo_03',
      title: 'Grocery Shopping',
      amount: 320.5,
      category: 'Food',
      type: 'expense',
      date: `${m0}-05`,
      description: 'Weekly groceries and fresh produce'
    },
    {
      id: 'txn_demo_04',
      title: 'Electric & Fiber Internet',
      amount: 168.4,
      category: 'Utilities',
      type: 'expense',
      date: `${m0}-07`,
      description: 'Monthly electricity and home internet bill'
    },
    {
      id: 'txn_demo_05',
      title: 'UI Consulting Retainer',
      amount: 950,
      category: 'Freelance',
      type: 'income',
      date: `${m0}-09`,
      description: 'Client design system audit'
    },
    {
      id: 'txn_demo_06',
      title: 'Metro Pass & Fuel',
      amount: 142,
      category: 'Transport',
      type: 'expense',
      date: `${m0}-10`,
      description: 'Monthly transit pass and commuter fuel'
    },
    {
      id: 'txn_demo_07',
      title: 'Pharmacy & Dental Checkup',
      amount: 185,
      category: 'Healthcare',
      type: 'expense',
      date: `${m0}-11`,
      description: 'Routine dental cleaning and prescriptions'
    },
    {
      id: 'txn_demo_08',
      title: 'Neighborhood Bistro & Coffee',
      amount: 215.8,
      category: 'Food',
      type: 'expense',
      date: `${m0}-${todayDay}`,
      description: 'Dining out and weekly coffee beans'
    },
    // Month -1
    {
      id: 'txn_demo_09',
      title: 'Monthly Salary',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: `${m1}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'txn_demo_10',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m1}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'txn_demo_11',
      title: 'Whole Foods & Market',
      amount: 495,
      category: 'Food',
      type: 'expense',
      date: `${m1}-08`,
      description: 'Household groceries'
    },
    {
      id: 'txn_demo_12',
      title: 'Utilities Bundle',
      amount: 175,
      category: 'Utilities',
      type: 'expense',
      date: `${m1}-12`,
      description: 'Water, electric, and internet'
    },
    {
      id: 'txn_demo_13',
      title: 'Running Shoes & Jacket',
      amount: 240,
      category: 'Shopping',
      type: 'expense',
      date: `${m1}-18`,
      description: 'Autumn athletic gear'
    },
    {
      id: 'txn_demo_14',
      title: 'Concert & Streaming',
      amount: 135,
      category: 'Entertainment',
      type: 'expense',
      date: `${m1}-22`,
      description: 'Live music tickets and subscriptions'
    },
    // Month -2
    {
      id: 'txn_demo_15',
      title: 'Monthly Salary',
      amount: 5250,
      category: 'Salary',
      type: 'income',
      date: `${m2}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'txn_demo_16',
      title: 'Dividend Distribution',
      amount: 310,
      category: 'Investments',
      type: 'income',
      date: `${m2}-15`,
      description: 'Quarterly index fund dividend'
    },
    {
      id: 'txn_demo_17',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m2}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'txn_demo_18',
      title: 'Groceries & Dining',
      amount: 540,
      category: 'Food',
      type: 'expense',
      date: `${m2}-14`,
      description: 'Monthly food expenses'
    },
    {
      id: 'txn_demo_19',
      title: 'Online Course Subscription',
      amount: 199,
      category: 'Education',
      type: 'expense',
      date: `${m2}-20`,
      description: 'Systems architecture workshop'
    },
    // Month -3
    {
      id: 'txn_demo_20',
      title: 'Monthly Salary',
      amount: 5250,
      category: 'Salary',
      type: 'income',
      date: `${m3}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'txn_demo_21',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m3}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'txn_demo_22',
      title: 'Groceries & Household',
      amount: 465,
      category: 'Food',
      type: 'expense',
      date: `${m3}-11`,
      description: 'Weekly supermarket runs'
    },
    {
      id: 'txn_demo_23',
      title: 'Train Tickets & Rideshare',
      amount: 210,
      category: 'Transport',
      type: 'expense',
      date: `${m3}-19`,
      description: 'Regional rail travel'
    },
    // Month -4
    {
      id: 'txn_demo_24',
      title: 'Monthly Salary',
      amount: 5250,
      category: 'Salary',
      type: 'income',
      date: `${m4}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'txn_demo_25',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m4}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'txn_demo_26',
      title: 'Summer Travel & Lodging',
      amount: 680,
      category: 'Entertainment',
      type: 'expense',
      date: `${m4}-16`,
      description: 'Weekend coastal trip'
    },
    {
      id: 'txn_demo_27',
      title: 'Groceries',
      amount: 430,
      category: 'Food',
      type: 'expense',
      date: `${m4}-21`,
      description: 'Supermarket purchases'
    },
    // Month -5
    {
      id: 'txn_demo_28',
      title: 'Monthly Salary',
      amount: 5100,
      category: 'Salary',
      type: 'income',
      date: `${m5}-01`,
      description: 'Primary payroll direct deposit'
    },
    {
      id: 'txn_demo_29',
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: `${m5}-02`,
      description: 'Monthly lease payment'
    },
    {
      id: 'txn_demo_30',
      title: 'Groceries & Utilities',
      amount: 590,
      category: 'Food',
      type: 'expense',
      date: `${m5}-12`,
      description: 'Food and monthly utilities'
    }
  ].map(normalizeTransaction);
}

/**
 * Seeds initial transactions and default monthly budget only once per browser storage.
 */
export function seedInitialDataIfNeeded() {
  try {
    const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (initialized === 'true') {
      return;
    }

    const demoTransactions = createDemoTransactions();
    const defaultBudget = {
      defaultAmount: 3000,
      byMonth: {
        [getLocalMonthKey(0)]: 3000
      }
    };

    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(demoTransactions));
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(defaultBudget));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  } catch (err) {
    console.error('Failed to seed initial LocalStorage data:', err);
  }
}

/**
 * Resets LocalStorage to clean demo state.
 */
export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
  seedInitialDataIfNeeded();
}

/**
 * Retrieves all stored transactions.
 * @returns {Array<object>}
 */
export function getTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTransaction);
  } catch (err) {
    console.error('Error reading transactions from LocalStorage:', err);
    return [];
  }
}

/**
 * Persists the entire transactions array to LocalStorage.
 * @param {Array<object>} transactions
 */
export function saveTransactions(transactions) {
  const sanitized = Array.isArray(transactions) ? transactions.map(normalizeTransaction) : [];
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(sanitized));
}

/**
 * Creates and persists a new transaction.
 * @param {object} transactionInput
 * @returns {object}
 */
export function addTransaction(transactionInput) {
  const transactions = getTransactions();
  const newTxn = normalizeTransaction({
    ...transactionInput,
    id: transactionInput.id || generateId()
  });
  transactions.push(newTxn);
  saveTransactions(transactions);
  return newTxn;
}

/**
 * Updates an existing transaction by ID.
 * @param {string} id
 * @param {object} updatedFields
 * @returns {object|null}
 */
export function updateTransaction(id, updatedFields) {
  const transactions = getTransactions();
  const idx = transactions.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const updated = normalizeTransaction({
    ...transactions[idx],
    ...updatedFields,
    id
  });

  transactions[idx] = updated;
  saveTransactions(transactions);
  return updated;
}

/**
 * Deletes a transaction by ID.
 * @param {string} id
 * @returns {boolean}
 */
export function deleteTransaction(id) {
  const transactions = getTransactions();
  const next = transactions.filter((t) => t.id !== id);
  if (next.length === transactions.length) return false;
  saveTransactions(next);
  return true;
}

/**
 * Retrieves the stored budget configuration object.
 * @returns {{ defaultAmount: number, byMonth: Record<string, number> }}
 */
export function getBudget() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BUDGETS);
    if (!raw) {
      return { defaultAmount: 0, byMonth: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      defaultAmount: Number(parsed.defaultAmount) || 0,
      byMonth: parsed.byMonth && typeof parsed.byMonth === 'object' ? parsed.byMonth : {}
    };
  } catch (err) {
    console.error('Error reading budget from LocalStorage:', err);
    return { defaultAmount: 0, byMonth: {} };
  }
}

/**
 * Persists budget configuration.
 * @param {{ defaultAmount?: number, byMonth?: Record<string, number> }} budgetData
 */
export function saveBudget(budgetData) {
  const current = getBudget();
  const next = {
    defaultAmount:
      budgetData.defaultAmount !== undefined
        ? Number(Number(budgetData.defaultAmount).toFixed(2))
        : current.defaultAmount,
    byMonth: {
      ...current.byMonth,
      ...(budgetData.byMonth || {})
    }
  };
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(next));
  return next;
}

/**
 * Returns the budget amount configured for a specific YYYY-MM month (falls back to defaultAmount).
 * @param {string} monthKey
 * @returns {number}
 */
export function getBudgetAmountForMonth(monthKey) {
  const budget = getBudget();
  if (monthKey && budget.byMonth && typeof budget.byMonth[monthKey] === 'number') {
    return budget.byMonth[monthKey];
  }
  return budget.defaultAmount || 0;
}

/**
 * Saves a specific monthly budget limit.
 * @param {string} monthKey
 * @param {number} amount
 */
export function saveBudgetForMonth(monthKey, amount) {
  const numericAmount = Number(Number(amount).toFixed(2));
  const current = getBudget();
  return saveBudget({
    defaultAmount: current.defaultAmount || numericAmount,
    byMonth: {
      [monthKey]: numericAmount
    }
  });
}
