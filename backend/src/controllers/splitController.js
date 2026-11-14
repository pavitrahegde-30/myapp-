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

// GET /api/splits
function getAllSplits(req, res, next) {
  try {
    const splits = db.prepare('SELECT * FROM split_expenses ORDER BY date DESC, id DESC').all();
    const getParticipantsStmt = db.prepare('SELECT * FROM split_participants WHERE split_expense_id = ? ORDER BY id ASC');

    const result = splits.map((split) => {
      const participants = getParticipantsStmt.all(split.id);
      let totalOwed = 0;
      let totalSettled = 0;

      for (const p of participants) {
        const amt = Number(p.amount) || 0;
        if (p.status === 'settled') {
          totalSettled += amt;
        } else {
          totalOwed += amt;
        }
      }

      const isFullySettled = participants.length > 0 && participants.every((p) => p.status === 'settled');

      return {
        ...split,
        participants,
        total_owed: Number(totalOwed.toFixed(2)),
        total_settled: Number(totalSettled.toFixed(2)),
        is_fully_settled: isFullySettled
      };
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/splits/:id
function getSplitById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid split expense ID: must be a positive integer'
      });
    }

    const split = db.prepare('SELECT * FROM split_expenses WHERE id = ?').get(id);
    if (!split) {
      return res.status(404).json({
        success: false,
        error: `Split expense with ID ${id} not found`
      });
    }

    const participants = db.prepare('SELECT * FROM split_participants WHERE split_expense_id = ? ORDER BY id ASC').all(id);
    res.status(200).json({
      success: true,
      data: {
        ...split,
        participants
      }
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/splits
function createSplit(req, res, next) {
  try {
    const { title, total_amount, category, date, description, paid_by, my_share, participants, record_my_share } = req.body || {};

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Title is required and must not be empty'
      });
    }

    const totalAmt = Number(total_amount);
    if (isNaN(totalAmt) || totalAmt <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Total amount must be a number greater than 0'
      });
    }

    if (!category || typeof category !== 'string' || category.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Category is required and must not be empty'
      });
    }

    if (!date || typeof date !== 'string' || !isValidDate(date)) {
      return res.status(400).json({
        success: false,
        error: 'Date is required and must be a valid YYYY-MM-DD date'
      });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one participant must be provided to split the expense'
      });
    }

    for (const p of participants) {
      if (!p.name || typeof p.name !== 'string' || p.name.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Each participant must have a non-empty name'
        });
      }
      const pAmt = Number(p.amount);
      if (isNaN(pAmt) || pAmt < 0) {
        return res.status(400).json({
          success: false,
          error: `Participant "${p.name}" has an invalid amount: must be 0 or greater`
        });
      }
    }

    const trimmedTitle = title.trim();
    const trimmedCategory = category.trim();
    const trimmedPaidBy = (paid_by && typeof paid_by === 'string' && paid_by.trim()) || 'You';
    const numMyShare = my_share !== undefined ? Math.max(0, Number(Number(my_share).toFixed(2))) : 0;
    const desc = description !== undefined && description !== null ? String(description).trim() : null;

    // Use atomic transaction to insert split, participants, and optional transaction
    const executeInsert = db.transaction(() => {
      const splitStmt = db.prepare(`
        INSERT INTO split_expenses (title, total_amount, category, date, description, paid_by, my_share)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const splitResult = splitStmt.run(trimmedTitle, Number(totalAmt.toFixed(2)), trimmedCategory, date, desc, trimmedPaidBy, numMyShare);
      const splitId = splitResult.lastInsertRowid;

      const participantStmt = db.prepare(`
        INSERT INTO split_participants (split_expense_id, name, amount, status)
        VALUES (?, ?, ?, ?)
      `);

      for (const p of participants) {
        const pStatus = p.status === 'settled' ? 'settled' : 'pending';
        participantStmt.run(splitId, p.name.trim(), Number(Number(p.amount).toFixed(2)), pStatus);
      }

      // If user selected to record their personal share into the transactions ledger
      if (record_my_share && numMyShare > 0) {
        const txnStmt = db.prepare(`
          INSERT INTO transactions (title, amount, category, type, date, description)
          VALUES (?, ?, ?, 'expense', ?, ?)
        `);
        txnStmt.run(
          `${trimmedTitle} (My Share)`,
          numMyShare,
          trimmedCategory,
          date,
          `Split expense: ${trimmedTitle} (Total: $${Number(totalAmt.toFixed(2))})`
        );
      }

      return splitId;
    });

    const newSplitId = executeInsert();
    const created = db.prepare('SELECT * FROM split_expenses WHERE id = ?').get(newSplitId);
    const createdParticipants = db.prepare('SELECT * FROM split_participants WHERE split_expense_id = ? ORDER BY id ASC').all(newSplitId);

    res.status(201).json({
      success: true,
      data: {
        ...created,
        participants: createdParticipants
      }
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/splits/participants/:id/settle
function settleParticipant(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid participant ID: must be a positive integer'
      });
    }

    const participant = db.prepare('SELECT * FROM split_participants WHERE id = ?').get(id);
    if (!participant) {
      return res.status(404).json({
        success: false,
        error: `Participant with ID ${id} not found`
      });
    }

    const targetStatus = req.body && req.body.status
      ? (req.body.status === 'settled' ? 'settled' : 'pending')
      : (participant.status === 'settled' ? 'pending' : 'settled');

    const settledAt = targetStatus === 'settled' ? new Date().toISOString() : null;

    db.prepare('UPDATE split_participants SET status = ?, settled_at = ? WHERE id = ?').run(targetStatus, settledAt, id);

    // If user asked to record settled payment as income in transactions ledger
    if (req.body && req.body.record_income && targetStatus === 'settled') {
      const today = new Date().toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO transactions (title, amount, category, type, date, description)
        VALUES (?, ?, 'Other', 'income', ?, ?)
      `).run(
        `Settlement from ${participant.name}`,
        participant.amount,
        today,
        `Reimbursement for split bill`
      );
    }

    const updated = db.prepare('SELECT * FROM split_participants WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/splits/:id
function deleteSplit(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid split expense ID: must be a positive integer'
      });
    }

    const split = db.prepare('SELECT * FROM split_expenses WHERE id = ?').get(id);
    if (!split) {
      return res.status(404).json({
        success: false,
        error: `Split expense with ID ${id} not found`
      });
    }

    const deleteTxn = db.transaction(() => {
      db.prepare('DELETE FROM split_participants WHERE split_expense_id = ?').run(id);
      db.prepare('DELETE FROM split_expenses WHERE id = ?').run(id);
    });

    deleteTxn();

    res.status(200).json({
      success: true,
      message: `Split expense with ID ${id} deleted successfully`
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllSplits,
  getSplitById,
  createSplit,
  settleParticipant,
  deleteSplit
};
