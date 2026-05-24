/**
 * dashboardController.js — Analytics & CRM stats (PostgreSQL)
 */

const pool = require('../config/database');

// GET /api/dashboard/stats
const getStats = async (req, res, next) => {
  try {
    const { rows: [{ count: ordersToday }] } = await pool.query(
      `SELECT COUNT(*) AS count FROM repair_orders WHERE created_at::date = CURRENT_DATE`
    );

    const { rows: [{ count: activeOrders }] } = await pool.query(
      `SELECT COUNT(*) AS count FROM repair_orders
       WHERE status NOT IN ('delivered', 'cancelled')`
    );

    const { rows: [{ total: monthRevenue }] } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE status = 'paid'
         AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    const { rows: [{ total: lastMonthRevenue }] } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
       WHERE status = 'paid'
         AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')`
    );

    const { rows: [{ count: totalCustomers }] } = await pool.query(
      `SELECT COUNT(*) AS count FROM customers`
    );

    const { rows: [{ count: activeTechs }] } = await pool.query(
      `SELECT COUNT(*) AS count FROM technicians WHERE is_active = true`
    );

    const { rows: byStatus } = await pool.query(
      `SELECT status, COUNT(*) AS count FROM repair_orders GROUP BY status`
    );

    const { rows: [{ count: completedThisMonth }] } = await pool.query(
      `SELECT COUNT(*) AS count FROM repair_orders
       WHERE status = 'delivered'
         AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    const mr  = parseFloat(monthRevenue);
    const lmr = parseFloat(lastMonthRevenue);
    const revenueGrowth = lmr > 0 ? (((mr - lmr) / lmr) * 100).toFixed(1) : null;

    res.json({
      success: true,
      data: {
        orders_today:         parseInt(ordersToday),
        active_orders:        parseInt(activeOrders),
        revenue_this_month:   mr,
        revenue_last_month:   lmr,
        revenue_growth_pct:   revenueGrowth,
        total_customers:      parseInt(totalCustomers),
        active_technicians:   parseInt(activeTechs),
        completed_this_month: parseInt(completedThisMonth),
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
         paid_at::date AS date,
         COALESCE(SUM(amount), 0) AS revenue,
         COUNT(*) AS orders
       FROM payments
       WHERE status = 'paid'
         AND paid_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL
       GROUP BY paid_at::date
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
       LEFT JOIN payments p ON p.order_id = ro.id AND p.status = 'paid'
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
    const { rows: newOrders } = await pool.query(
      `SELECT order_id, device_brand, device_model, created_at
       FROM repair_orders WHERE status = 'pending'
       ORDER BY created_at DESC LIMIT 5`
    );

    const { rows: pendingPickups } = await pool.query(
      `SELECT order_id, device_brand, scheduled_date
       FROM repair_orders
       WHERE status = 'pickup_assigned' AND scheduled_date = CURRENT_DATE
       ORDER BY scheduled_time ASC`
    );

    const { rows: readyOrders } = await pool.query(
      `SELECT order_id, device_brand, device_model
       FROM repair_orders WHERE status = 'ready'
       ORDER BY updated_at ASC LIMIT 5`
    );

    res.json({
      success: true,
      data: { new_orders: newOrders, pending_pickups: pendingPickups, ready_orders: readyOrders },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats, getRecentOrders, getRevenueChart,
  getTechnicianPerformance, getNotifications,
};
