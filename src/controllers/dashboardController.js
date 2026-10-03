/**
 * dashboardController.js — Analytics & CRM stats (PostgreSQL)
 */

const pool = require('../config/database');

// GET /api/dashboard/stats
// Each metric is a scalar subquery in ONE statement — one database round trip
// instead of eight sequential ones, without holding eight pool connections.
const getStats = async (req, res, next) => {
  try {
    const [{ rows: [s] }, { rows: byStatus }] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM repair_orders WHERE created_at::date = CURRENT_DATE) AS orders_today,
           (SELECT COUNT(*) FROM repair_orders WHERE status NOT IN ('delivered', 'cancelled')) AS active_orders,
           (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
             INNER JOIN repair_orders ro ON p.order_id = ro.id
             WHERE p.status = 'paid' AND ro.status <> 'cancelled'
               AND DATE_TRUNC('month', p.paid_at) = DATE_TRUNC('month', CURRENT_DATE)) AS month_revenue,
           (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
             INNER JOIN repair_orders ro ON p.order_id = ro.id
             WHERE p.status = 'paid' AND ro.status <> 'cancelled'
               AND DATE_TRUNC('month', p.paid_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')) AS last_month_revenue,
           (SELECT COUNT(*) FROM customers) AS total_customers,
           (SELECT COUNT(*) FROM technicians WHERE is_active = true) AS active_techs,
           (SELECT COUNT(*) FROM repair_orders
             WHERE status = 'delivered'
               AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE)) AS completed_this_month`
      ),
      pool.query(`SELECT status, COUNT(*) AS count FROM repair_orders GROUP BY status`),
    ]);

    const mr  = parseFloat(s.month_revenue);
    const lmr = parseFloat(s.last_month_revenue);
    const revenueGrowth = lmr > 0 ? (((mr - lmr) / lmr) * 100).toFixed(1) : null;

    res.json({
      success: true,
      data: {
        orders_today:         parseInt(s.orders_today),
        active_orders:        parseInt(s.active_orders),
        revenue_this_month:   mr,
        revenue_last_month:   lmr,
        revenue_growth_pct:   revenueGrowth,
        total_customers:      parseInt(s.total_customers),
        active_technicians:   parseInt(s.active_techs),
        completed_this_month: parseInt(s.completed_this_month),
        orders_by_status:     byStatus.map((r) => ({ ...r, count: parseInt(r.count) })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/dashboard/recent-orders
const getRecentOrders = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const { rows: orders } = await pool.query(
      `SELECT
         ro.id, ro.order_id, ro.status, ro.priority,
         ro.device_brand, ro.device_model, ro.estimated_cost,
         ro.service_type, ro.created_at,
         c.name AS customer_name, c.phone AS customer_phone,
         t.name AS technician_name, t.avatar_color
       FROM repair_orders ro
       LEFT JOIN customers c   ON ro.customer_id   = c.id
       LEFT JOIN technicians t ON ro.technician_id = t.id
       ORDER BY ro.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

// GET /api/dashboard/revenue-chart
const getRevenueChart = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    let interval;
    if (period === '7d')       interval = 7;
    else if (period === '90d') interval = 90;
    else                       interval = 30;

    const { rows: daily } = await pool.query(
      `SELECT
         p.paid_at::date AS date,
         COALESCE(SUM(p.amount), 0) AS revenue,
         COUNT(*) AS orders
       FROM payments p
       INNER JOIN repair_orders ro ON p.order_id = ro.id
       WHERE p.status = 'paid' AND ro.status <> 'cancelled'
         AND p.paid_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL
       GROUP BY p.paid_at::date
       ORDER BY date ASC`,
      [interval]
    );

    res.json({
      success: true,
      data: daily.map((r) => ({ ...r, revenue: parseFloat(r.revenue), orders: parseInt(r.orders) })),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/dashboard/technician-performance
const getTechnicianPerformance = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         t.id, t.name, t.avatar_color,
         COUNT(ro.id) AS total_orders,
         SUM(CASE WHEN ro.status = 'delivered' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN ro.status NOT IN ('delivered', 'cancelled') THEN 1 ELSE 0 END) AS active,
         COALESCE(SUM(p.amount), 0) AS revenue_generated
       FROM technicians t
       LEFT JOIN repair_orders ro ON ro.technician_id = t.id
       LEFT JOIN payments p ON p.order_id = ro.id AND p.status = 'paid' AND ro.status <> 'cancelled'
       WHERE t.is_active = true
       GROUP BY t.id, t.name, t.avatar_color
       ORDER BY completed DESC`
    );

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        total_orders:      parseInt(r.total_orders),
        completed:         parseInt(r.completed),
        active:            parseInt(r.active),
        revenue_generated: parseFloat(r.revenue_generated),
      })),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/dashboard/notifications
const getNotifications = async (req, res, next) => {
  try {
    const [{ rows: newOrders }, { rows: pendingPickups }, { rows: readyOrders }] = await Promise.all([
      pool.query(
        `SELECT order_id, device_brand, device_model, created_at
         FROM repair_orders WHERE status = 'pending'
         ORDER BY created_at DESC LIMIT 5`
      ),
      pool.query(
        `SELECT order_id, device_brand, scheduled_date
         FROM repair_orders
         WHERE status = 'pickup_assigned' AND scheduled_date = CURRENT_DATE
         ORDER BY scheduled_time ASC`
      ),
      pool.query(
        `SELECT order_id, device_brand, device_model
         FROM repair_orders WHERE status = 'ready'
         ORDER BY updated_at ASC LIMIT 5`
      ),
    ]);

    res.json({
      success: true,
      data: { new_orders: newOrders, pending_pickups: pendingPickups, ready_orders: readyOrders },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/dashboard/telecaller-stats  (owner or telecaller — no financial data)
const getTelecallerStats = async (req, res, next) => {
  try {
    // "Needs attention": orders sitting in 'pending' for more than 24h with no activity yet.
    const { rows: [s] } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM repair_orders WHERE created_at::date = CURRENT_DATE) AS new_orders_today,
         (SELECT COUNT(*) FROM order_activities
           WHERE type = 'callback' AND status = 'pending') AS pending_calls,
         (SELECT COUNT(*) FROM order_activities
           WHERE type = 'repair_appointment' AND status = 'pending'
             AND scheduled_at::date = CURRENT_DATE) AS todays_repairs,
         (SELECT COUNT(*) FROM order_activities
           WHERE type IN ('follow_up', 'post_repair_follow_up') AND status = 'pending'
             AND scheduled_at::date = CURRENT_DATE) AS todays_followups,
         (SELECT COUNT(*) FROM order_activities
           WHERE status = 'pending' AND scheduled_at < NOW()) AS overdue,
         (SELECT COUNT(*) FROM repair_orders ro
           WHERE ro.status = 'pending' AND ro.created_at < NOW() - INTERVAL '24 hours'
             AND NOT EXISTS (SELECT 1 FROM order_activities oa WHERE oa.order_id = ro.id)) AS needs_attention`
    );

    res.json({
      success: true,
      data: {
        new_orders_today: parseInt(s.new_orders_today),
        pending_calls:     parseInt(s.pending_calls),
        todays_repairs:    parseInt(s.todays_repairs),
        todays_followups:  parseInt(s.todays_followups),
        overdue_activities: parseInt(s.overdue),
        needs_attention:   parseInt(s.needs_attention),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats, getRecentOrders, getRevenueChart,
  getTechnicianPerformance, getNotifications, getTelecallerStats,
};
