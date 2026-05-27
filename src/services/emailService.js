/**
 * emailService.js — Sends confirmation emails via Nodemailer SMTP
 * Configure SMTP credentials in .env (works with Gmail, Brevo, or any SMTP).
 */

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️  Email not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    return null;
  }

  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send booking confirmation email to customer.
 */
async function sendBookingConfirmation({ orderId, customerName, customerEmail, deviceBrand, deviceModel, services, pickupAddress, scheduledDate, scheduledTime }) {
  const t = getTransporter();
  if (!t) return;

  const servicesList = Array.isArray(services) ? services.join(', ') : services;
  const dateStr = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : 'To be confirmed';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Booking Confirmed — TurboFix</title>
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
  .footer { background:#f8fafc; padding:24px 40px; text-align:center; border-top:1px solid #e2e8f0; }
  .footer p { font-size:12px; color:#94a3b8; margin:4px 0; }
  .footer a { color:#3b82f6; text-decoration:none; }
  @media(max-width:500px){
    .body,.header,.footer{padding:24px 20px;}
    .detail-grid{grid-template-columns:1fr;}
  }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>⚡ TurboFix</h1>
    <p>Professional Mobile Repair · Hyderabad</p>
  </div>
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
  </div>
  <div class="footer">
    <p><strong>TurboFix Support</strong></p>
    <p>📞 <a href="tel:+918639605147">+91 86396 05147</a> &nbsp;|&nbsp; 📧 <a href="mailto:support@turbofix.in">support@turbofix.in</a></p>
    <p>🌐 <a href="https://turbofix.in">turbofix.in</a></p>
    <p style="margin-top:12px;font-size:11px;color:#cbd5e1;">This is an automated confirmation email. Please do not reply to this email.<br/>© ${new Date().getFullYear()} TurboFix, Hyderabad.</p>
  </div>
</div>
</body>
</html>`;

  try {
    await t.sendMail({
      from:    `"TurboFix" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to:      customerEmail,
      subject: `Booking Confirmed — ${orderId} | TurboFix`,
      html,
    });
    console.log(`✅ Confirmation email sent to ${customerEmail} for order ${orderId}`);
  } catch (err) {
    console.error(`❌ Failed to send confirmation email for ${orderId}:`, err.message);
  }
}

module.exports = { sendBookingConfirmation };
