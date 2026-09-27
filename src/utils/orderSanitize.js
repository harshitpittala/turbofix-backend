/**
 * orderSanitize.js — strips owner-only financial data from order payloads
 * before they reach a telecaller. Pure functions — no DB/network access —
 * so the RBAC redaction logic can be unit tested directly.
 */

const { isTelecaller } = require('./roles');

// Fields that expose pricing / revenue and must never reach a telecaller response.
const FINANCIAL_ORDER_FIELDS = ['estimated_cost', 'actual_cost', 'amount_paid'];

// Field names a non-owner may never set via any order write endpoint.
const PROTECTED_PRICE_FIELDS = ['estimated_cost', 'actual_cost'];

// Redacts financial fields from a single order row — but only for the telecaller
// role. Owners keep full access, and this must never change what technicians
// already see (that's pre-existing behavior outside this RBAC change's scope).
// Returns a new object; never mutates the input.
function sanitizeOrderForRole(order, user) {
  if (!order || !isTelecaller(user)) return order;

  const clean = { ...order };
  for (const field of FINANCIAL_ORDER_FIELDS) delete clean[field];
  if (Array.isArray(clean.payments)) delete clean.payments;

  return clean;
}

function sanitizeOrdersForRole(orders, user) {
  if (!isTelecaller(user)) return orders;
  return (orders || []).map((o) => sanitizeOrderForRole(o, user));
}

// Returns the subset of `body` keys that attempt to set a protected price field
// to a defined value. Used to reject (not silently drop) crafted payloads from
// non-owner callers on order create/update endpoints.
function findProtectedPriceFields(body) {
  if (!body) return [];
  return PROTECTED_PRICE_FIELDS.filter((f) => body[f] !== undefined && body[f] !== null && body[f] !== '');
}

module.exports = {
  FINANCIAL_ORDER_FIELDS, PROTECTED_PRICE_FIELDS,
  sanitizeOrderForRole, sanitizeOrdersForRole, findProtectedPriceFields,
};
