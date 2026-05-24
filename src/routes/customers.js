/**
 * routes/customers.js
 */

const express = require('express');
const router  = express.Router();

const { getCustomers, getCustomerById, updateCustomer, lookupCustomer } = require('../controllers/customerController');
const { authenticate, authorizeAdmin } = require('../middleware/auth');

router.use(authenticate, authorizeAdmin);

router.get('/lookup',  lookupCustomer);
router.get('/',        getCustomers);
router.get('/:id',     getCustomerById);
router.put('/:id',     updateCustomer);

module.exports = router;
