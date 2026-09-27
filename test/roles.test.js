const test = require('node:test');
const assert = require('node:assert/strict');

const { isOwner, isTelecaller, isAdminTable, OWNER_ROLES } = require('../src/utils/roles');

test('OWNER_ROLES excludes telecaller', () => {
  assert.deepEqual(OWNER_ROLES, ['super_admin', 'admin']);
});

test('isOwner is true for admin and super_admin, false for telecaller/technician', () => {
  assert.equal(isOwner({ type: 'admin', role: 'admin' }), true);
  assert.equal(isOwner({ type: 'admin', role: 'super_admin' }), true);
  assert.equal(isOwner({ type: 'admin', role: 'telecaller' }), false);
  assert.equal(isOwner({ type: 'technician' }), false);
  assert.equal(isOwner(undefined), false);
});

test('isTelecaller is true only for the telecaller role on the admins table', () => {
  assert.equal(isTelecaller({ type: 'admin', role: 'telecaller' }), true);
  assert.equal(isTelecaller({ type: 'admin', role: 'admin' }), false);
  assert.equal(isTelecaller({ type: 'technician', role: 'telecaller' }), false);
  assert.equal(isTelecaller(undefined), false);
});

test('isAdminTable is true for any admins-table role, false for technicians', () => {
  assert.equal(isAdminTable({ type: 'admin', role: 'telecaller' }), true);
  assert.equal(isAdminTable({ type: 'admin', role: 'admin' }), true);
  assert.equal(isAdminTable({ type: 'technician' }), false);
  assert.equal(isAdminTable(undefined), false);
});
