/**
 * routes/customers.js
 */

const express = require('express');
const router  = express.Router();

const { getCustomers, getCustomerById, updateCustomer, lookupCustomer } = require('../controllers/customerController');
const { authenticate, authorizeAdminOrTelecaller } = require('../middleware/auth');

// Customer records hold no pricing data — owner and telecaller both get full access.
// Order history returned per-customer is redacted for telecaller in the controller.
router.use(authenticate, authorizeAdminOrTelecaller);

router.get('/lookup',  lookupCustomer);
router.get('/',        getCustomers);
router.get('/:id',     getCustomerById);
router.put('/:id',     updateCustomer);

module.exports = router;
