/**
 * routes/expenses.js
 */

const express = require('express');
const { body } = require('express-validator');
const router  = express.Router();

const { getExpenses, createExpense, updateExpense, deleteExpense, getExpenseSummary } = require('../controllers/expenseController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');
const validate = require('../middleware/validate');

const expenseRules = [
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('expense_date').isISO8601().withMessage('Valid expense date required'),
  body('reason').trim().notEmpty().withMessage('Reason is required'),
];

router.use(authenticate, authorizeAdmin);

router.get('/summary', getExpenseSummary);
router.get('/',        getExpenses);
router.post('/',       expenseRules, validate, createExpense);
router.put('/:id',     updateExpense);
router.delete('/:id',  deleteExpense);

module.exports = router;
