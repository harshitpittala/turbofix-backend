const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeOrderForRole, sanitizeOrdersForRole, findProtectedPriceFields,
} = require('../src/utils/orderSanitize');

const owner      = { type: 'admin', role: 'admin' };
const superAdmin = { type: 'admin', role: 'super_admin' };
const telecaller = { type: 'admin', role: 'telecaller' };
const technician = { type: 'technician' };

const sampleOrder = () => ({
  id: 1, order_id: 'TFX-100000', status: 'pending',
  estimated_cost: '500.00', actual_cost: '480.00', amount_paid: '200.00',
  payments: [{ id: 1, amount: '200.00', method: 'cash' }],
  customer_name: 'Jane Doe',
});

test('sanitizeOrderForRole leaves the order untouched for owner roles', () => {
  const order = sampleOrder();
  assert.deepEqual(sanitizeOrderForRole(order, owner), order);
  assert.deepEqual(sanitizeOrderForRole(order, superAdmin), order);
});

test('sanitizeOrderForRole leaves the order untouched for technicians (unchanged pre-existing behavior)', () => {
  const order = sampleOrder();
  assert.deepEqual(sanitizeOrderForRole(order, technician), order);
});

test('sanitizeOrderForRole strips pricing and payments for a telecaller', () => {
  const clean = sanitizeOrderForRole(sampleOrder(), telecaller);
  assert.equal('estimated_cost' in clean, false);
  assert.equal('actual_cost' in clean, false);
  assert.equal('amount_paid' in clean, false);
  assert.equal('payments' in clean, false);
  assert.equal(clean.customer_name, 'Jane Doe');
  assert.equal(clean.order_id, 'TFX-100000');
});

test('sanitizeOrderForRole never mutates the original object', () => {
  const order = sampleOrder();
  sanitizeOrderForRole(order, telecaller);
  assert.equal('estimated_cost' in order, true);
});

test('sanitizeOrdersForRole maps a list consistently with the single-order helper', () => {
  const orders = [sampleOrder(), { ...sampleOrder(), id: 2 }];
  const clean = sanitizeOrdersForRole(orders, telecaller);
  assert.equal(clean.length, 2);
  clean.forEach((o) => assert.equal('estimated_cost' in o, false));

  const untouched = sanitizeOrdersForRole(orders, owner);
  assert.deepEqual(untouched, orders);
});

test('findProtectedPriceFields flags defined, non-empty price fields only', () => {
  assert.deepEqual(findProtectedPriceFields({ estimated_cost: 100 }), ['estimated_cost']);
  assert.deepEqual(findProtectedPriceFields({ actual_cost: 0 }), ['actual_cost']);
  assert.deepEqual(findProtectedPriceFields({ estimated_cost: undefined }), []);
  assert.deepEqual(findProtectedPriceFields({ estimated_cost: null }), []);
  assert.deepEqual(findProtectedPriceFields({ estimated_cost: '' }), []);
  assert.deepEqual(findProtectedPriceFields({ priority: 'high' }), []);
  assert.deepEqual(
    findProtectedPriceFields({ estimated_cost: 10, actual_cost: 20 }).sort(),
    ['actual_cost', 'estimated_cost']
  );
});
