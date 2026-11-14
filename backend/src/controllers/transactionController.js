const db = require('../config/database');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return (
    dateObj.getFullYear() === y &&
    dateObj.getMonth() + 1 === m &&
    dateObj.getDate() === d
  );
}

function validateTransactionData({ title, amount, category, type, date }) {
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return 'Title is required and must not be empty';
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return 'Amount must be a valid number greater than 0';
  }

  if (!category || typeof category !== 'string' || category.trim() === '') {
    return 'Category is required and must not be empty';
  }

  if (type !== 'income' && type !== 'expense') {
    return 'Type must be either "income" or "expense"';
  }

  if (!date || typeof date !== 'string' || !isValidDate(date)) {
    return 'Date is required and must be a valid YYYY-MM-DD date';
  }

  return null;
}

// GET /api/transactions
function getAllTransactions(req, res, next) {
  try {
    const stmt = db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    const transactions = stmt.all();
    res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/transactions/:id
function getTransactionById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID: must be a positive integer'
      });
    }

    const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    const transaction = stmt.get(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found`
      });
    }

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/transactions
function createTransaction(req, res, next) {
  try {
    const { title, amount, category, type, date, description } = req.body || {};

    const validationError = validateTransactionData({ title, amount, category, type, date });
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const trimmedTitle = title.trim();
    const numAmount = Number(Number(amount).toFixed(2));
    const trimmedCategory = category.trim();
    const desc = description !== undefined && description !== null ? String(description).trim() : null;

    const stmt = db.prepare(`
      INSERT INTO transactions (title, amount, category, type, date, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(trimmedTitle, numAmount, trimmedCategory, type, date, desc);
    const newTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      data: newTxn
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/transactions/:id
function updateTransaction(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID: must be a positive integer'
      });
    }

    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found`
      });
    }

    const { title, amount, category, type, date, description } = req.body || {};
    const validationError = validateTransactionData({ title, amount, category, type, date });
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError
      });
    }

    const trimmedTitle = title.trim();
    const numAmount = Number(Number(amount).toFixed(2));
    const trimmedCategory = category.trim();
    const desc = description !== undefined && description !== null ? String(description).trim() : null;

    const stmt = db.prepare(`
      UPDATE transactions
      SET title = ?, amount = ?, category = ?, type = ?, date = ?, description = ?
      WHERE id = ?
    `);

    stmt.run(trimmedTitle, numAmount, trimmedCategory, type, date, desc, id);
    const updatedTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      data: updatedTxn
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/transactions/:id
function deleteTransaction(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction ID: must be a positive integer'
      });
    }

    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: `Transaction with ID ${id} not found`
      });
    }

    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    stmt.run(id);

    res.status(200).json({
      success: true,
      message: `Transaction ${id} deleted successfully`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction
};
