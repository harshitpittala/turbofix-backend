/**
 * roles.js — shared role predicates for the admins table
 *
 * `admins.role` is one of 'super_admin' | 'admin' | 'telecaller'.
 * "Owner" roles (super_admin, admin) keep full CRM access, including
 * financial data. 'telecaller' is a restricted operational role added
 * for the telecaller workflow — never treat it as an owner role.
 */

const OWNER_ROLES = ['super_admin', 'admin'];

// True for any authenticated admins-table user with owner-level (financial) access.
const isOwner = (user) => user?.type === 'admin' && OWNER_ROLES.includes(user?.role);

// True only for the restricted telecaller role.
const isTelecaller = (user) => user?.type === 'admin' && user?.role === 'telecaller';

// True for any admins-table user regardless of role (owner or telecaller).
const isAdminTable = (user) => user?.type === 'admin';

module.exports = { OWNER_ROLES, isOwner, isTelecaller, isAdminTable };
