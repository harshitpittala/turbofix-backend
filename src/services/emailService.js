/**
 * emailService.js — TurboFix Email Automation via Resend HTTP API
 *
 * WHY RESEND INSTEAD OF SMTP:
 *   Render free tier blocks / rate-limits outbound SMTP connections.
 *   Resend uses HTTPS (port 443) which is always open — no SMTP timeouts.
 *
 * SETUP:
 *   1. Sign up free at https://resend.com
 *   2. Create an API key (Sending access)
 *   3. Add RESEND_API_KEY to your Render environment variables
 *   4. (Optional) Verify turbofix.in domain in Resend → use FROM_EMAIL=noreply@turbofix.in
 *      Until domain is verified, use FROM_EMAIL=onboarding@resend.dev (Resend's test address)
 *
 * TESTING:
 *   POST /api/orders/test-email  { "email": "you@example.com" }  (admin auth required)
 *
 * EXPORTS:
 *   sendBookingConfirmation({ orderId, customerName, customerEmail, ... })
 *   sendAdminNotification({ orderId, customerName, customerPhone, ... })
 */

const { Resend } = require('resend');

// ── Resend client (lazy-initialised so missing API key is caught at send-time, not startup) ──
let _resend = null;

function getResend() {
  if (_resend) return _resend;

  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️  [email] RESEND_API_KEY not set — emails will be skipped');
    return null;
  }

  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// ── Sender address ───────────────────────────────────────────────────────────
// Before verifying turbofix.in in Resend: use  onboarding@resend.dev
// After  verifying turbofix.in in Resend: use  noreply@turbofix.in
const FROM = process.env.FROM_EMAIL || 'TurboFix <onboarding@resend.dev>';

// ── Admin notification recipient ─────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'support@turbofix.in';

// ── Shared HTML helpers ──────────────────────────────────────────────────────
const emailWrapper = (bodyContent) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { margin:0; padding:0; background:#f0f4f8; font-family:'Inter',Arial,sans-serif; }
  .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .header { background:linear-gradient(135deg,#0066FF,#00AAFF); padding:36px 40px; text-align:center; }
  .header h1 { color:#fff; margin:0; font-size:26px; font-weight:800; letter-spacing:-0.5px; }
  .header p  { color:rgba(255,255,255,0.85); margin:6px 0 0; font-size:14px; }
  .body { padding:36px 40px; }
  .greeting { font-size:17px; color:#1a202c; font-weight:600; margin-bottom:8px; }
  .sub { font-size:14px; color:#64748b; margin-bottom:28px; line-height:1.6; }
  .ref-box { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:14px 20px; display:inline-block; margin-bottom:28px; }
  .ref-label { font-size:11px; font-weight:600; color:#3b82f6; text-transform:uppercase; letter-spacing:.06em; }
  .ref-id { font-size:20px; font-weight:800; color:#1e3a8a; font-family:monospace; margin-top:2px; }
  .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px; }
  .detail-item { background:#f8fafc; border-radius:8px; padding:14px 16px; }
  .detail-label { font-size:11px; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
  .detail-value { font-size:14px; font-weight:600; color:#1e293b; }
  .address-box { background:#f8fafc; border-radius:8px; padding:14px 16px; margin-bottom:28px; }
  .steps { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:20px; margin-bottom:28px; }
  .steps h3 { font-size:13px; font-weight:700; color:#166534; text-transform:uppercase; letter-spacing:.06em; margin:0 0 12px; }
  .step { display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; font-size:13px; color:#166534; }
  .step:last-child { margin-bottom:0; }
  .step-num { width:20px; height:20px; background:#16a34a; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; margin-top:1px; }
  .alert-box { background:#fff7ed; border:1px solid #fed7aa; border-radius:10px; padding:20px; margin-bottom:28px; }
  .alert-box h3 { font-size:13px; font-weight:700; color:#c2410c; text-transform:uppercase; letter-spacing:.06em; margin:0 0 12px; }
  .alert-row { font-size:14px; color:#431407; margin-bottom:6px; }
  .alert-row span { font-weight:600; }
  .footer { background:#f8fafc; padding:24px 40px; text-align:center; border-top:1px solid #e2e8f0; }
  .footer p { font-size:12px; color:#94a3b8; margin:4px 0; }
  .footer a { color:#3b82f6; text-decoration:none; }
  @media(max-width:500px){
    .body,.header,.footer{ padding:24px 20px; }
    .detail-grid{ grid-template-columns:1fr; }
  }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>⚡ TurboFix</h1>
    <p>Professional Mobile Repair · Hyderabad</p>
  </div>
  ${bodyContent}
  <div class="footer">
    <p><strong>TurboFix Support</strong></p>
    <p>📞 <a href="tel:+918639605147">+91 86396 05147</a> &nbsp;|&nbsp; 📧 <a href="mailto:support@turbofix.in">support@turbofix.in</a></p>
    <p>🌐 <a href="https://turbofix.in">turbofix.in</a></p>
    <p style="margin-top:12px;font-size:11px;color:#cbd5e1;">This is an automated email. Please do not reply directly.<br/>© ${new Date().getFullYear()} TurboFix, Hyderabad.</p>
  </div>
</div>
</body>
</html>`;

// ── 1. Customer booking confirmation ─────────────────────────────────────────
/**
 * Sends a booking confirmation email to the customer.
 * Called from orderController after the DB transaction commits.
 * Non-blocking — booking succeeds even if this fails.
 */
async function sendBookingConfirmation({
  orderId, customerName, customerEmail,
  deviceBrand, deviceModel, services,
  pickupAddress, scheduledDate, scheduledTime,
}) {
  const resend = getResend();
  if (!resend) return;            // silently skip — API key not configured
  if (!customerEmail) return;     // no email address provided by customer

  const servicesList = Array.isArray(services) ? services.join(', ') : (services || 'To be confirmed');
  const dateStr = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      })
    : 'To be confirmed';

  const html = emailWrapper(`
  <div class="body">
    <div class="greeting">Hi ${customerName},</div>
    <div class="sub">
      Your repair booking has been confirmed! We'll get your device fixed and back to you as quickly as possible.
    </div>

    <div class="ref-box">
      <div class="ref-label">Booking Reference</div>
      <div class="ref-id">${orderId}</div>
    </div>

    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">Device</div>
        <div class="detail-value">${deviceBrand} ${deviceModel}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Repair Issue</div>
        <div class="detail-value">${servicesList}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Pickup Date</div>
        <div class="detail-value">${dateStr}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Pickup Time</div>
        <div class="detail-value">${scheduledTime || 'To be confirmed'}</div>
      </div>
    </div>

    <div class="address-box">
      <div class="detail-label">Pickup Address</div>
      <div class="detail-value" style="margin-top:4px;">${pickupAddress || 'To be confirmed'}</div>
    </div>

    <div class="steps">
      <h3>What Happens Next</h3>
      <div class="step"><div class="step-num">1</div><span>Our technician will call you 30 minutes before pickup</span></div>
      <div class="step"><div class="step-num">2</div><span>Free diagnostic assessment — no payment required upfront</span></div>
      <div class="step"><div class="step-num">3</div><span>Once you approve the quote, we begin the repair immediately</span></div>
      <div class="step"><div class="step-num">4</div><span>Device delivered back to you with a 6-month warranty</span></div>
    </div>
  </div>`);

  try {
    const { data, error } = await resend.emails.send({
      from:    FROM,
      to:      customerEmail,
      subject: `Booking Confirmed — ${orderId} | TurboFix`,
      html,
    });

    if (error) {
      console.error(`❌ [email] Customer confirmation failed for ${orderId}:`, error);
    } else {
      console.log(`✅ [email] Customer confirmation sent → ${customerEmail} | order: ${orderId} | resend_id: ${data?.id}`);
    }
  } catch (err) {
    // Never throw — booking is already saved, email is best-effort
    console.error(`❌ [email] Unexpected error sending customer confirmation for ${orderId}:`, err.message);
  }
}

// ── 2. Admin new-booking notification ────────────────────────────────────────
/**
 * Sends a new-booking alert to the admin/support inbox.
 * Gives the team an instant notification for every new order.
 */
async function sendAdminNotification({
  orderId, customerName, customerPhone, customerEmail,
  deviceBrand, deviceModel, services,
  pickupAddress, scheduledDate, scheduledTime, serviceType,
}) {
  const resend = getResend();
  if (!resend) return;

  const servicesList = Array.isArray(services) ? services.join(', ') : (services || '—');
  const dateStr = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      })
    : 'Not specified';

  const html = emailWrapper(`
  <div class="body">
    <div class="greeting">🔔 New Repair Booking Received</div>
    <div class="sub">A customer just submitted a repair request. Details below.</div>

    <div class="ref-box">
      <div class="ref-label">Order ID</div>
      <div class="ref-id">${orderId}</div>
    </div>

    <div class="alert-box">
      <h3>Customer Details</h3>
      <div class="alert-row">👤 Name: <span>${customerName}</span></div>
      <div class="alert-row">📞 Phone: <span><a href="tel:${customerPhone}" style="color:#c2410c;">${customerPhone}</a></span></div>
      <div class="alert-row">📧 Email: <span>${customerEmail || '—'}</span></div>
      <div class="alert-row">📍 Address: <span>${pickupAddress || '—'}</span></div>
    </div>

    <div class="detail-grid">
      <div class="detail-item">
        <div class="detail-label">Device</div>
        <div class="detail-value">${deviceBrand} ${deviceModel}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Service Type</div>
        <div class="detail-value" style="text-transform:capitalize;">${serviceType || '—'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Repair Issue</div>
        <div class="detail-value">${servicesList}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Scheduled</div>
        <div class="detail-value">${dateStr}${scheduledTime ? ' · ' + scheduledTime : ''}</div>
      </div>
    </div>

    <div style="text-align:center;margin-top:8px;">
      <a href="https://crm.turbofix.in" style="display:inline-block;background:linear-gradient(135deg,#0066FF,#00AAFF);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">
        Open CRM Dashboard →
      </a>
    </div>
  </div>`);

  try {
    const { data, error } = await resend.emails.send({
      from:    FROM,
      to:      ADMIN_EMAIL,
      subject: `🔔 New Booking: ${orderId} — ${deviceBrand} ${deviceModel} (${customerName})`,
      html,
    });

    if (error) {
      console.error(`❌ [email] Admin notification failed for ${orderId}:`, error);
    } else {
      console.log(`✅ [email] Admin notification sent → ${ADMIN_EMAIL} | order: ${orderId} | resend_id: ${data?.id}`);
    }
  } catch (err) {
    console.error(`❌ [email] Unexpected error sending admin notification for ${orderId}:`, err.message);
  }
}

module.exports = { sendBookingConfirmation, sendAdminNotification };
