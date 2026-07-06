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

// ── Resend client (lazy-initialised so missing API key is caught at send-time) ──
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

// ── Config ───────────────────────────────────────────────────────────────────
// Before verifying turbofix.in in Resend: FROM_EMAIL=TurboFix <onboarding@resend.dev>
// After  verifying turbofix.in in Resend: FROM_EMAIL=TurboFix <noreply@turbofix.in>
const FROM        = process.env.FROM_EMAIL || 'TurboFix <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'support@turbofix.in';

// ── 1. Customer booking confirmation ─────────────────────────────────────────
/**
 * Sends the premium "Booking Confirmed" email to the customer.
 * Design mirrors the SuccessScreen component from the frontend exactly.
 */
async function sendBookingConfirmation({
  orderId, customerName, customerEmail,
  deviceBrand, deviceModel, services,
  pickupAddress, scheduledDate, scheduledTime,
}) {
  const resend = getResend();
  if (!resend) return;
  if (!customerEmail) return;

  const servicesList = Array.isArray(services)
    ? services.join(', ')
    : (services || 'To be confirmed');

  const servicesCount = Array.isArray(services) ? services.length : 1;

  const dateStr = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      })
    : 'To be confirmed';

  const dateShort = scheduledDate
    ? new Date(scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short',
      })
    : '—';

  const deviceFull = `${deviceBrand || ''} ${deviceModel || ''}`.trim() || 'Your Device';

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>Booking Confirmed — TurboFix</title>
  <style>
    /* ── Reset ── */
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; height:auto; line-height:100%; outline:none; text-decoration:none; }
    /* ── Mobile ── */
    @media only screen and (max-width:620px) {
      .email-container { width:100% !important; }
      .detail-cell {
        display:block !important;
        width:100% !important;
        padding:8px 0 !important;
      }
      .detail-card {
        margin:0 0 8px 0 !important;
        width:100% !important;
        display:block !important;
      }
      .btn-row td { display:block !important; width:100% !important; padding:5px 0 !important; text-align:center !important; }
      .hero-heading { font-size:28px !important; }
      .section-pad { padding:24px 20px !important; }
    }
    /* ── Dark mode (Apple Mail, Outlook for Mac) ── */
    @media (prefers-color-scheme: dark) {
      .email-bg    { background-color:#030712 !important; }
      .card-bg     { background-color:#0a0f1e !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#030712;font-family:'Inter',Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;" class="email-bg">

<!-- Outer wrapper -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#030712;" class="email-bg">
<tr><td align="center" style="padding:32px 16px;">

  <!-- Email container -->
  <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0"
    style="width:100%;max-width:600px;background-color:#080d1a;border-radius:20px;overflow:hidden;
           border:1px solid rgba(0,170,255,0.12);
           box-shadow:0 0 60px rgba(0,102,255,0.08),0 40px 80px rgba(0,0,0,0.6);">

    <!-- ═══ TOP SHIMMER LINE ═══ -->
    <tr>
      <td style="height:2px;background:linear-gradient(90deg,transparent 0%,#0066FF 30%,#00AAFF 50%,#0066FF 70%,transparent 100%);font-size:0;line-height:0;">&nbsp;</td>
    </tr>

    <!-- ═══ LOGO HEADER ═══ -->
    <tr>
      <td align="center" style="padding:28px 32px 0;background-color:#080d1a;" class="section-pad">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td valign="middle" style="padding-right:10px;">
              <!-- Logo mark: blue gradient square with lightning bolt -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(135deg,#0066FF,#00AAFF);border-radius:10px;width:42px;height:42px;">
                <tr><td align="center" valign="middle" style="width:42px;height:42px;text-align:center;vertical-align:middle;font-size:22px;line-height:1;">
                  &#x26A1;
                </td></tr>
              </table>
            </td>
            <td valign="middle">
              <span style="font-size:22px;font-weight:900;color:#0066FF;letter-spacing:-0.5px;font-family:Arial,Helvetica,sans-serif;">Turbo<span style="color:#00AAFF;">Fix</span></span>
            </td>
          </tr>
        </table>
        <p style="margin:8px 0 0;font-size:11px;color:#4a5568;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Professional Mobile Repair · Hyderabad</p>
      </td>
    </tr>

    <!-- ═══ SUCCESS HERO ═══ -->
    <tr>
      <td align="center" style="padding:36px 32px 24px;" class="section-pad">

        <!-- Glowing success circle -->
        <div style="display:inline-block;position:relative;margin-bottom:24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
            <tr><td align="center">
              <!-- Outer glow ring -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                style="background:rgba(34,197,94,0.08);border-radius:50%;width:88px;height:88px;border:1px solid rgba(34,197,94,0.2);">
                <tr><td align="center" valign="middle" style="width:88px;height:88px;text-align:center;vertical-align:middle;">
                  <!-- Inner circle -->
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                    style="background:rgba(34,197,94,0.15);border-radius:50%;width:68px;height:68px;border:1.5px solid rgba(34,197,94,0.45);margin:0 auto;">
                    <tr><td align="center" valign="middle" style="width:68px;height:68px;text-align:center;vertical-align:middle;font-size:32px;line-height:1;">
                      ✓
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </div>

        <!-- Heading -->
        <h1 class="hero-heading" style="margin:0 0 10px;font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.1;font-family:Arial,Helvetica,sans-serif;">
          Booking Confirmed!
        </h1>

        <!-- Greeting -->
        <p style="margin:0 0 6px;font-size:15px;color:#9ca3af;line-height:1.5;">
          Hey <span style="color:#ffffff;font-weight:600;">${customerName}</span>, you're all set.
        </p>
        <p style="margin:0 0 28px;font-size:13px;color:#6b7280;">
          Confirmation sent to <span style="color:#00AAFF;">${customerEmail}</span>
        </p>

        <!-- Booking Reference card — mirrors the blue ref box from SuccessScreen -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"
          style="background:rgba(0,170,255,0.07);border:1px solid rgba(0,170,255,0.22);border-radius:14px;margin:0 auto;">
          <tr>
            <td style="padding:14px 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:12px;font-size:18px;color:#00AAFF;">&#x26A1;</td>
                  <td valign="middle">
                    <p style="margin:0;font-size:10px;font-weight:700;color:#4a9eff;text-transform:uppercase;letter-spacing:0.1em;">Booking Reference</p>
                    <p style="margin:3px 0 0;font-size:18px;font-weight:800;color:#ffffff;font-family:'Courier New',Courier,monospace;letter-spacing:1px;">${orderId}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- ═══ DETAIL CARDS GRID — mirrors the 2x2 glass cards from SuccessScreen ═══ -->
    <tr>
      <td style="padding:0 24px 24px;" class="section-pad">

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <!-- Row 1: Device + Services -->
          <tr>
            <td class="detail-cell" width="50%" valign="top" style="padding:0 6px 12px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                class="detail-card"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:20px;">📱</p>
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Device</p>
                    <p style="margin:0;font-size:13px;font-weight:600;color:#e2e8f0;line-height:1.4;">${deviceFull}</p>
                  </td>
                </tr>
              </table>
            </td>
            <td class="detail-cell" width="50%" valign="top" style="padding:0 0 12px 6px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                class="detail-card"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:20px;">🔧</p>
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Services</p>
                    <p style="margin:0;font-size:13px;font-weight:600;color:#e2e8f0;line-height:1.4;">${servicesCount} repair${servicesCount > 1 ? 's' : ''}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Row 2: Date + Time -->
          <tr>
            <td class="detail-cell" width="50%" valign="top" style="padding:0 6px 0 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                class="detail-card"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:20px;">📅</p>
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Date</p>
                    <p style="margin:0;font-size:13px;font-weight:600;color:#e2e8f0;">${dateShort}</p>
                  </td>
                </tr>
              </table>
            </td>
            <td class="detail-cell" width="50%" valign="top" style="padding:0 0 0 6px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
                class="detail-card"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 6px;font-size:20px;">⏰</p>
                    <p style="margin:0 0 3px;font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Time</p>
                    <p style="margin:0;font-size:13px;font-weight:600;color:#e2e8f0;">${scheduledTime || 'To be confirmed'}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- ═══ REPAIR DETAILS FULL CARD ═══ -->
    <tr>
      <td style="padding:0 24px 20px;" class="section-pad">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
          style="background:rgba(0,102,255,0.05);border:1px solid rgba(0,170,255,0.15);border-radius:14px;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 14px;font-size:10px;font-weight:700;color:#00AAFF;text-transform:uppercase;letter-spacing:0.1em;">Repair Details</p>
              <!-- Device row -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:10px;">
                <tr>
                  <td width="50%" style="font-size:12px;color:#6b7280;padding-bottom:8px;">Device</td>
                  <td width="50%" align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;padding-bottom:8px;">${deviceFull}</td>
                </tr>
              </table>
              <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:10px;font-size:0;line-height:0;">&nbsp;</div>
              <!-- Services row -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:10px;">
                <tr>
                  <td width="40%" style="font-size:12px;color:#6b7280;padding-bottom:8px;vertical-align:top;">Issue(s)</td>
                  <td width="60%" align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;padding-bottom:8px;">${servicesList}</td>
                </tr>
              </table>
              <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:10px;font-size:0;line-height:0;">&nbsp;</div>
              <!-- Date row -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:10px;">
                <tr>
                  <td width="50%" style="font-size:12px;color:#6b7280;padding-bottom:8px;">Pickup Date</td>
                  <td width="50%" align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;padding-bottom:8px;">${dateStr}</td>
                </tr>
              </table>
              <div style="height:1px;background:rgba(255,255,255,0.05);margin-bottom:10px;font-size:0;line-height:0;">&nbsp;</div>
              <!-- Address row -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td width="35%" style="font-size:12px;color:#6b7280;vertical-align:top;">Pickup Address</td>
                  <td width="65%" align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;">${pickupAddress || 'To be confirmed'}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ═══ WHAT HAPPENS NEXT — mirrors the numbered steps from SuccessScreen ═══ -->
    <tr>
      <td style="padding:0 24px 24px;" class="section-pad">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
          style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;">
          <tr>
            <td style="padding:20px 20px;">
              <p style="margin:0 0 16px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;">What Happens Next</p>

              <!-- Step 1 -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:13px;">
                <tr>
                  <td width="28" valign="top" style="padding-top:1px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                      style="background:rgba(0,170,255,0.15);border-radius:50%;width:22px;height:22px;">
                      <tr><td align="center" valign="middle" style="width:22px;height:22px;text-align:center;vertical-align:middle;font-size:10px;font-weight:800;color:#00AAFF;">1</td></tr>
                    </table>
                  </td>
                  <td style="padding-left:10px;font-size:12px;color:#9ca3af;line-height:1.5;">You'll receive an SMS &amp; email confirmation</td>
                </tr>
              </table>

              <!-- Step 2 -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:13px;">
                <tr>
                  <td width="28" valign="top" style="padding-top:1px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                      style="background:rgba(0,170,255,0.15);border-radius:50%;width:22px;height:22px;">
                      <tr><td align="center" valign="middle" style="width:22px;height:22px;text-align:center;vertical-align:middle;font-size:10px;font-weight:800;color:#00AAFF;">2</td></tr>
                    </table>
                  </td>
                  <td style="padding-left:10px;font-size:12px;color:#9ca3af;line-height:1.5;">Our technician will call 30 min before pickup</td>
                </tr>
              </table>

              <!-- Step 3 -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:13px;">
                <tr>
                  <td width="28" valign="top" style="padding-top:1px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                      style="background:rgba(0,170,255,0.15);border-radius:50%;width:22px;height:22px;">
                      <tr><td align="center" valign="middle" style="width:22px;height:22px;text-align:center;vertical-align:middle;font-size:10px;font-weight:800;color:#00AAFF;">3</td></tr>
                    </table>
                  </td>
                  <td style="padding-left:10px;font-size:12px;color:#9ca3af;line-height:1.5;">Free diagnostic assessment — no payment yet</td>
                </tr>
              </table>

              <!-- Step 4 -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td width="28" valign="top" style="padding-top:1px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                      style="background:rgba(0,170,255,0.15);border-radius:50%;width:22px;height:22px;">
                      <tr><td align="center" valign="middle" style="width:22px;height:22px;text-align:center;vertical-align:middle;font-size:10px;font-weight:800;color:#00AAFF;">4</td></tr>
                    </table>
                  </td>
                  <td style="padding-left:10px;font-size:12px;color:#9ca3af;line-height:1.5;">Repair approved? We get to work immediately</td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ═══ ACTION BUTTONS — mirrors the button row from SuccessScreen ═══ -->
    <tr>
      <td align="center" style="padding:0 24px 28px;" class="section-pad">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="btn-row">
          <tr>
            <!-- WhatsApp button -->
            <td style="padding:0 6px 0 0;" class="btn-cell">
              <a href="https://wa.me/918639605147?text=Hi%2C%20my%20booking%20ID%20is%20${orderId}%20%E2%80%94%20need%20help"
                target="_blank"
                style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;
                       font-size:13px;font-weight:700;padding:12px 20px;border-radius:12px;
                       font-family:Arial,Helvetica,sans-serif;white-space:nowrap;">
                💬 WhatsApp Us
              </a>
            </td>
            <!-- Visit website button -->
            <td style="padding:0 6px;" class="btn-cell">
              <a href="https://turbofix.in"
                target="_blank"
                style="display:inline-block;background:transparent;color:#00AAFF;text-decoration:none;
                       font-size:13px;font-weight:700;padding:11px 20px;border-radius:12px;
                       border:1.5px solid rgba(0,170,255,0.4);
                       font-family:Arial,Helvetica,sans-serif;white-space:nowrap;">
                🌐 Visit Website
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ═══ WARRANTY / TRUST STRIP ═══ -->
    <tr>
      <td style="padding:0 24px 24px;" class="section-pad">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
          style="background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.15);border-radius:12px;">
          <tr>
            <td align="center" style="padding:14px 20px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:0 12px;font-size:11px;color:#4ade80;text-align:center;">🛡 6-month warranty</td>
                  <td style="font-size:11px;color:#374151;">|</td>
                  <td style="padding:0 12px;font-size:11px;color:#4ade80;text-align:center;">✓ Genuine parts</td>
                  <td style="font-size:11px;color:#374151;">|</td>
                  <td style="padding:0 12px;font-size:11px;color:#4ade80;text-align:center;">⚡ Same-day service</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ═══ DIVIDER ═══ -->
    <tr>
      <td style="padding:0 24px;">
        <div style="height:1px;background:rgba(255,255,255,0.05);font-size:0;line-height:0;">&nbsp;</div>
      </td>
    </tr>

    <!-- ═══ FOOTER ═══ -->
    <tr>
      <td align="center" style="padding:24px 32px 28px;" class="section-pad">

        <!-- Brand name in footer -->
        <p style="margin:0 0 10px;font-size:15px;font-weight:800;color:#0066FF;font-family:Arial,Helvetica,sans-serif;">
          Turbo<span style="color:#00AAFF;">Fix</span>
        </p>

        <!-- Contact info -->
        <p style="margin:0 0 6px;font-size:12px;color:#4a5568;">
          <a href="tel:+918639605147" style="color:#64748b;text-decoration:none;">📞 +91 86396 05147</a>
          &nbsp;&nbsp;|&nbsp;&nbsp;
          <a href="mailto:support@turbofix.in" style="color:#64748b;text-decoration:none;">✉ support@turbofix.in</a>
        </p>

        <!-- Address -->
        <p style="margin:0 0 14px;font-size:11px;color:#374151;">
          11-1-441, Aghapura, Nampally, Hyderabad, Telangana 500001
        </p>

        <!-- Social links -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 16px;">
          <tr>
            <td style="padding:0 6px;">
              <a href="https://instagram.com/turbofix" target="_blank"
                style="display:inline-block;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
                       border-radius:8px;padding:7px 12px;font-size:11px;color:#9ca3af;text-decoration:none;">
                Instagram
              </a>
            </td>
            <td style="padding:0 6px;">
              <a href="https://facebook.com/turbofix" target="_blank"
                style="display:inline-block;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
                       border-radius:8px;padding:7px 12px;font-size:11px;color:#9ca3af;text-decoration:none;">
                Facebook
              </a>
            </td>
            <td style="padding:0 6px;">
              <a href="https://turbofix.in" target="_blank"
                style="display:inline-block;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
                       border-radius:8px;padding:7px 12px;font-size:11px;color:#9ca3af;text-decoration:none;">
                Website
              </a>
            </td>
          </tr>
        </table>

        <!-- Legal -->
        <p style="margin:0;font-size:10px;color:#1f2937;line-height:1.6;">
          This is an automated confirmation email. Please do not reply directly.<br/>
          © ${new Date().getFullYear()} TurboFix. All rights reserved.
        </p>

      </td>
    </tr>

    <!-- ═══ BOTTOM SHIMMER LINE ═══ -->
    <tr>
      <td style="height:2px;background:linear-gradient(90deg,transparent 0%,rgba(0,102,255,0.4) 50%,transparent 100%);font-size:0;line-height:0;">&nbsp;</td>
    </tr>

  </table>
  <!-- /Email container -->

</td></tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from:    FROM,
      to:      customerEmail,
      subject: `⚡ Booking Confirmed — ${orderId} | TurboFix`,
      html,
    });

    if (error) {
      console.error(`❌ [email] Customer confirmation failed for ${orderId}:`, error);
    } else {
      console.log(`✅ [email] Customer confirmation sent → ${customerEmail} | order: ${orderId} | resend_id: ${data?.id}`);
    }
  } catch (err) {
    console.error(`❌ [email] Unexpected error for ${orderId}:`, err.message);
  }
}

// ── 2. Admin new-booking notification ────────────────────────────────────────
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Booking — TurboFix CRM</title>
</head>
<body style="margin:0;padding:0;background:#030712;font-family:'Inter',Arial,Helvetica,sans-serif;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#030712;">
<tr><td align="center" style="padding:24px 16px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0"
    style="width:100%;max-width:560px;background:#080d1a;border-radius:16px;overflow:hidden;border:1px solid rgba(0,170,255,0.15);">

    <!-- Shimmer -->
    <tr><td style="height:2px;background:linear-gradient(90deg,transparent,#0066FF,#00AAFF,transparent);font-size:0;">&nbsp;</td></tr>

    <!-- Header -->
    <tr>
      <td style="padding:24px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.05);">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td>
              <span style="font-size:18px;font-weight:900;color:#0066FF;font-family:Arial,sans-serif;">Turbo<span style="color:#00AAFF;">Fix</span></span>
              <span style="font-size:11px;color:#4a5568;margin-left:8px;">CRM Notification</span>
            </td>
            <td align="right">
              <span style="display:inline-block;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;color:#ef4444;">🔔 NEW BOOKING</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:24px 28px;">

        <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#ffffff;">New repair booking received</p>

        <!-- Order ID badge -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:20px;">
          <tr>
            <td style="background:rgba(0,170,255,0.07);border:1px solid rgba(0,170,255,0.2);border-radius:10px;padding:10px 18px;">
              <span style="font-size:10px;font-weight:700;color:#4a9eff;text-transform:uppercase;letter-spacing:0.1em;display:block;margin-bottom:3px;">Order ID</span>
              <span style="font-size:16px;font-weight:800;color:#fff;font-family:'Courier New',monospace;">${orderId}</span>
            </td>
          </tr>
        </table>

        <!-- Customer details -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
          style="background:rgba(255,152,0,0.05);border:1px solid rgba(255,152,0,0.15);border-radius:12px;margin-bottom:16px;">
          <tr><td style="padding:16px 18px;">
            <p style="margin:0 0 10px;font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:0.1em;">Customer Details</p>
            <p style="margin:0 0 6px;font-size:13px;color:#e2e8f0;">👤 <strong>${customerName}</strong></p>
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;"><a href="tel:${customerPhone}" style="color:#9ca3af;text-decoration:none;">📞 ${customerPhone}</a></p>
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">📧 ${customerEmail || '—'}</p>
            <p style="margin:0;font-size:13px;color:#9ca3af;">📍 ${pickupAddress || '—'}</p>
          </td></tr>
        </table>

        <!-- Repair details -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
          style="background:rgba(0,170,255,0.04);border:1px solid rgba(0,170,255,0.12);border-radius:12px;margin-bottom:20px;">
          <tr><td style="padding:16px 18px;">
            <p style="margin:0 0 12px;font-size:10px;font-weight:700;color:#00AAFF;text-transform:uppercase;letter-spacing:0.1em;">Repair Details</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr><td style="font-size:12px;color:#6b7280;padding-bottom:8px;">Device</td><td align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;padding-bottom:8px;">${deviceBrand} ${deviceModel}</td></tr>
              <tr><td style="font-size:12px;color:#6b7280;padding-bottom:8px;">Service Type</td><td align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;padding-bottom:8px;text-transform:capitalize;">${serviceType || '—'}</td></tr>
              <tr><td style="font-size:12px;color:#6b7280;padding-bottom:8px;vertical-align:top;">Issue(s)</td><td align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;padding-bottom:8px;">${servicesList}</td></tr>
              <tr><td style="font-size:12px;color:#6b7280;">Scheduled</td><td align="right" style="font-size:12px;font-weight:600;color:#e2e8f0;">${dateStr}${scheduledTime ? ' · ' + scheduledTime : ''}</td></tr>
            </table>
          </td></tr>
        </table>

        <!-- CRM button -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td>
              <a href="https://crm.turbofix.in" target="_blank"
                style="display:inline-block;background:linear-gradient(135deg,#0066FF,#00AAFF);color:#ffffff;
                       text-decoration:none;font-size:13px;font-weight:700;padding:12px 24px;
                       border-radius:10px;font-family:Arial,sans-serif;">
                Open CRM Dashboard →
              </a>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td align="center" style="padding:16px 28px 20px;border-top:1px solid rgba(255,255,255,0.05);">
        <p style="margin:0;font-size:10px;color:#1f2937;">© ${new Date().getFullYear()} TurboFix · support@turbofix.in · +91 86396 05147</p>
      </td>
    </tr>

    <tr><td style="height:2px;background:linear-gradient(90deg,transparent,rgba(0,102,255,0.4),transparent);font-size:0;">&nbsp;</td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

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

// ── 3. Contact form message → admin inbox ────────────────────────────────────
/**
 * Sends a "New Contact Message" notification to ADMIN_EMAIL whenever a visitor
 * submits the /contact page form. Fire-and-forget from the route handler.
 */
async function sendContactMessage({ name, email, phone, subject, message }) {
  const resend = getResend();
  if (!resend) return { skipped: true };

  const safeSubject = subject && subject.trim() ? subject.trim() : 'New website enquiry';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>New Contact Message — TurboFix</title></head>
<body style="margin:0;padding:0;background:#030712;font-family:'Inter',Arial,Helvetica,sans-serif;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#030712;">
<tr><td align="center" style="padding:24px 16px;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0"
    style="width:100%;max-width:560px;background:#080d1a;border-radius:16px;overflow:hidden;border:1px solid rgba(0,170,255,0.15);">
    <tr><td style="height:2px;background:linear-gradient(90deg,transparent,#0066FF,#00AAFF,transparent);font-size:0;">&nbsp;</td></tr>
    <tr>
      <td style="padding:24px 28px 20px;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:18px;font-weight:900;color:#0066FF;font-family:Arial,sans-serif;">Turbo<span style="color:#00AAFF;">Fix</span></span>
        <span style="font-size:11px;color:#4a5568;margin-left:8px;">Website Contact Form</span>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;">
        <p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#ffffff;">${safeSubject}</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
          style="background:rgba(0,170,255,0.04);border:1px solid rgba(0,170,255,0.12);border-radius:12px;margin-bottom:16px;">
          <tr><td style="padding:16px 18px;">
            <p style="margin:0 0 6px;font-size:13px;color:#e2e8f0;">👤 <strong>${name}</strong></p>
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">📧 ${email}</p>
            <p style="margin:0;font-size:13px;color:#9ca3af;">📞 ${phone || 'Not provided'}</p>
          </td></tr>
        </table>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"
          style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;">
          <tr><td style="padding:16px 18px;">
            <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;">Message</p>
            <p style="margin:0;font-size:13px;color:#e2e8f0;white-space:pre-wrap;">${message}</p>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr><td style="height:2px;background:linear-gradient(90deg,transparent,rgba(0,102,255,0.4),transparent);font-size:0;">&nbsp;</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

  const { data, error } = await resend.emails.send({
    from:    FROM,
    to:      ADMIN_EMAIL,
    replyTo: email,
    subject: `📩 Contact Form: ${safeSubject} (${name})`,
    html,
  });

  if (error) {
    console.error('❌ [email] Contact message failed:', error);
    throw new Error('Failed to send message');
  }
  console.log(`✅ [email] Contact message sent → ${ADMIN_EMAIL} | from: ${email} | resend_id: ${data?.id}`);
  return { skipped: false };
}

module.exports = { sendBookingConfirmation, sendAdminNotification, sendContactMessage };
