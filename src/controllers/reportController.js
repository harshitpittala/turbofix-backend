/**
 * reportController.js — owner-only cross-role reporting
 *
 * getCustomerCareReport is deliberately financial-data-free: it counts orders,
 * never sums cost/revenue, so it stays safe even if reused by a non-owner
 * route in the future. It's currently mounted owner-only regardless.
 */

const pool = require('../config/database');

// GET /api/reports/customer-care?date_from=&date_to=&status=  (owner-only)
const getCustomerCareReport = async (req, res, next) => {
  try {
    const { date_from, date_to, status } = req.query;

    const dateConditions = [];
    const params = [];
    if (date_from) { dateConditions.push(`ro.created_at::date >= $${params.length + 1}`); params.push(date_from); }
    if (date_to)   { dateConditions.push(`ro.created_at::date <= $${params.length + 1}`); params.push(date_to); }
    if (status)    { dateConditions.push(`ro.status = $${params.length + 1}`);            params.push(status); }
    const dateWhere = dateConditions.length ? `AND ${dateConditions.join(' AND ')}` : '';

    const { rows: staff } = await pool.query(
      `SELECT id, name, role FROM admins WHERE role IN ('admin','super_admin','telecaller') ORDER BY name ASC`
    );

    const { rows: created } = await pool.query(
      `SELECT ro.created_by_id AS id, COUNT(*) AS count
       FROM repair_orders ro WHERE ro.created_by_id IS NOT NULL ${dateWhere}
       GROUP BY ro.created_by_id`,
      params
    );

    const { rows: attributed } = await pool.query(
      `SELECT ro.customer_care_id AS id, COUNT(*) AS count
       FROM repair_orders ro WHERE ro.customer_care_id IS NOT NULL ${dateWhere}
       GROUP BY ro.customer_care_id`,
      params
    );

    // "Handled" = distinct orders where this user logged at least one status change,
    // reusing the existing order_status_history audit trail (no new column needed).
    const { rows: handled } = await pool.query(
      `SELECT h.updated_by_id AS id, COUNT(DISTINCT h.order_id) AS count
       FROM order_status_history h
       INNER JOIN repair_orders ro ON ro.id = h.order_id
       WHERE h.updated_by_type = 'admin' ${dateWhere}
       GROUP BY h.updated_by_id`,
      params
    );

    const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.id, parseInt(r.count)]));
    const createdMap = toMap(created);
    const attributedMap = toMap(attributed);
    const handledMap = toMap(handled);

    const data = staff.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      orders_created:    createdMap[s.id] || 0,
      orders_attributed: attributedMap[s.id] || 0,
      orders_handled:    handledMap[s.id] || 0,
    })).sort((a, b) => b.orders_attributed - a.orders_attributed);

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCustomerCareReport };
