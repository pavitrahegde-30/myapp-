const db = require('../config/database');

// GET /api/budgets/:year/:month
function getBudgetByMonth(req, res, next) {
  try {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);

    if (isNaN(year) || year < 1900 || year > 2100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year: must be a valid 4-digit year'
      });
    }

    if (isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month: must be an integer between 1 and 12'
      });
    }

    const stmt = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?');
    const budget = stmt.get(year, month);

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: `No budget found for ${year}-${String(month).padStart(2, '0')}`
      });
    }

    res.status(200).json({
      success: true,
      data: budget
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/budgets
function createBudget(req, res, next) {
  try {
    const { year, month, amount } = req.body || {};

    const numYear = parseInt(year, 10);
    if (isNaN(numYear) || numYear < 1900 || numYear > 2100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid year: must be a valid 4-digit year'
      });
    }

    const numMonth = parseInt(month, 10);
    if (isNaN(numMonth) || numMonth < 1 || numMonth > 12) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month: must be an integer between 1 and 12'
      });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid number greater than 0'
      });
    }

    // Check if budget for that month and year already exists (409 Conflict)
    const existing = db.prepare('SELECT * FROM monthly_budgets WHERE year = ? AND month = ?').get(numYear, numMonth);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A budget for ${numYear}-${String(numMonth).padStart(2, '0')} already exists. Use PUT to update it.`,
        data: existing
      });
    }

    const formattedAmount = Number(numAmount.toFixed(2));
    const stmt = db.prepare(`
      INSERT INTO monthly_budgets (year, month, amount)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(numYear, numMonth, formattedAmount);
    const newBudget = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: newBudget
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/budgets/:id
function updateBudget(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid budget ID: must be a positive integer'
      });
    }

    const existing = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Budget with ID ${id} not found`
      });
    }

    const { amount } = req.body || {};
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a valid number greater than 0'
      });
    }

    const formattedAmount = Number(numAmount.toFixed(2));
    const stmt = db.prepare('UPDATE monthly_budgets SET amount = ? WHERE id = ?');
    stmt.run(formattedAmount, id);

    const updated = db.prepare('SELECT * FROM monthly_budgets WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBudgetByMonth,
  createBudget,
  updateBudget
};
