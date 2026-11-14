const express = require('express');
const router = express.Router();
const {
  getAllSplits,
  getSplitById,
  createSplit,
  settleParticipant,
  deleteSplit
} = require('../controllers/splitController');

router.get('/', getAllSplits);
router.get('/:id', getSplitById);
router.post('/', createSplit);
router.patch('/participants/:id/settle', settleParticipant);
router.delete('/:id', deleteSplit);

module.exports = router;
