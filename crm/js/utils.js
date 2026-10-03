/**
 * utils.js — Shared CRM utilities
 */

// ── API helper ────────────────────────────────────────────────────────────────
// Remembers the last button the user clicked so a mutating request can disable
// it while in flight — stops double-taps creating duplicate orders/payments.
let _lastClickedButton = null;
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('button');
  _lastClickedButton = btn ? { el: btn, at: Date.now() } : null;
}, true);

let _wakeToastShown = false;

async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('crm_token');
  const url   = CRM.API_BASE + endpoint;
  const method = (options.method || 'GET').toUpperCase();
  const isAuthEndpoint = endpoint.startsWith('/auth/');

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token && !isAuthEndpoint) headers['Authorization'] = `Bearer ${token}`;

  let busyBtn = null;
  if (method !== 'GET' && _lastClickedButton && Date.now() - _lastClickedButton.at < 1500 && !_lastClickedButton.el.disabled) {
    busyBtn = _lastClickedButton.el;
    busyBtn.disabled = true;
    _lastClickedButton = null;
  }

  // The free-tier backend sleeps when idle; tell the user instead of looking frozen.
  const wakeTimer = setTimeout(() => {
    if (_wakeToastShown) return;
    _wakeToastShown = true;
    showToast('Server is waking up — this can take up to a minute…', 'info', 8000);
  }, 6000);

  let resp;
  try {
    resp = await fetch(url, { ...options, headers });
  } catch {
    return { ok: false, status: 0, data: { success: false, message: 'Network error — check your internet connection' } };
  } finally {
    clearTimeout(wakeTimer);
    if (busyBtn) busyBtn.disabled = false;
  }

  const data = await resp.json().catch(() => ({ success: false, message: `Unexpected server response (${resp.status})` }));

  // A 401 from a login attempt means wrong credentials, not an expired session.
  if (resp.status === 401 && !isAuthEndpoint) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.location.href = './login.html?session=expired';
    return null;
  }

  return { ok: resp.ok, status: resp.status, data };
}

function apiErrorMessage(r, fallback = 'Something went wrong') {
  return (r && r.data && r.data.message) || fallback;
}

// Inline error block with a retry button, for list/panel loaders.
function loadErrorHTML(r, fallback, retryCall) {
  return `<div class="load-error"><span>${esc(apiErrorMessage(r, fallback))}</span>` +
    (retryCall ? `<button class="btn btn-secondary btn-sm" onclick="${retryCall}">Retry</button>` : '') + `</div>`;
}

// Guards against out-of-order responses: a slow earlier request must not
// overwrite the result of a newer one (fast filtering, switching records).
const _latestRequest = {};
function beginRequest(key) {
  const id = (_latestRequest[key] || 0) + 1;
  _latestRequest[key] = id;
  return () => _latestRequest[key] !== id;
}

// ── Toast notifications ───────────────────────────────────────────────────────
function showToast(message, type = 'success', duration = 3500) {
  const icons = {
    success: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
    error:   `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
    info:    `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    warn:    `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
  };
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `${icons[type] || icons.info}<span class="toast-msg"></span>`;
  toast.querySelector('.toast-msg').textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
// Scroll lock follows whether *any* modal is open, so closing a stacked modal
// (e.g. Update Status over Order Details) doesn't unlock the page underneath.
function syncBodyScrollLock() {
  const anyOpen = document.querySelector('.modal-overlay.open') ||
    (window.innerWidth <= 900 && document.querySelector('.sidebar.open'));
  document.body.style.overflow = anyOpen ? 'hidden' : '';
}
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); syncBodyScrollLock(); }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); syncBodyScrollLock(); }
}

// Backdrop click closes the modal — but only when the press also started on the
// backdrop, so selecting text in a field and releasing outside doesn't discard the form.
let _pressStartedOnOverlay = false;
document.addEventListener('mousedown', (e) => {
  _pressStartedOnOverlay = e.target.classList && e.target.classList.contains('modal-overlay');
});
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.classList && t.classList.contains('modal-overlay') && t.classList.contains('open') && _pressStartedOnOverlay) {
    closeModal(t.id);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelectorAll('.modal-overlay.open');
  if (open.length) { closeModal(open[open.length - 1].id); return; }
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) document.getElementById('menu-toggle')?.click();
});

// Today's date as YYYY-MM-DD in the user's local timezone (toISOString() is UTC,
// which is the previous day in India before 5:30 AM).
function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Date formatting ───────────────────────────────────────────────────────────
function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', ...opts,
  });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Currency ──────────────────────────────────────────────────────────────────
function formatCurrency(amount) {
  if (amount == null || amount === '') return '—';
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

// ── Status badge HTML ─────────────────────────────────────────────────────────
function statusBadge(status) {
  const label = CRM.STATUS_LABELS[status] || status;
  return `<span class="badge badge-${status}">${label}</span>`;
}
function priorityBadge(priority) {
  return `<span class="badge badge-${priority}">${CRM.PRIORITY_LABELS[priority] || priority}</span>`;
}
function activityStatusBadge(status) {
  const cls = { pending: 'badge-pending', done: 'badge-ready', cancelled: 'badge-cancelled' }[status] || 'badge-normal';
  return `<span class="badge ${cls}">${CRM.ACTIVITY_STATUS_LABELS[status] || status}</span>`;
}

// ── Tech avatar ───────────────────────────────────────────────────────────────
function techAvatar(name, color = '#00AAFF', size = 28) {
  const initial = (name || '?')[0].toUpperCase();
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:inline-flex;align-items:center;justify-content:center;font-size:${size * 0.4}px;font-weight:700;color:#fff;flex-shrink:0;">${initial}</div>`;
}

// ── WhatsApp link ─────────────────────────────────────────────────────────────
function waLink(phone, message = '') {
  const clean = phone.replace(/\D/g, '');
  const num   = clean.startsWith('91') ? clean : `91${clean}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
function copyText(text, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => showToast(`${label} copied`, 'success'));
}

// ── Pagination renderer ───────────────────────────────────────────────────────
function renderPagination(containerId, pagination, onPageChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { page, pages, total } = pagination;

  let html = `<span class="page-info">${total} total</span>`;
  html += `<button class="page-btn" aria-label="Previous page" onclick="${onPageChange}(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;

  const start = Math.max(1, page - 2);
  const end   = Math.min(pages, page + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" ${i === page ? 'aria-current="page"' : ''} onclick="${onPageChange}(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" aria-label="Next page" onclick="${onPageChange}(${page + 1})" ${page >= pages ? 'disabled' : ''}>›</button>`;

  el.innerHTML = html;
}

// ── Escape HTML ───────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Sidebar mobile toggle ─────────────────────────────────────────────────────
function initSidebar() {
  const toggle  = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;

  // Insert backdrop element right after sidebar if not already present
  let backdrop = document.getElementById('sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'sidebar-backdrop';
    backdrop.className = 'sidebar-backdrop';
    sidebar.insertAdjacentElement('afterend', backdrop);
  }

  toggle.setAttribute('aria-label', 'Open menu');
  toggle.setAttribute('aria-controls', 'sidebar');
  toggle.setAttribute('aria-expanded', 'false');

  const setOpen = (isOpen) => {
    sidebar.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    syncBodyScrollLock();
  };

  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setOpen(false));
  sidebar.addEventListener('click', (e) => { if (e.target.closest('.nav-item')) setOpen(false); });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
}

// ── Mark active nav ───────────────────────────────────────────────────────────
// Compares normalized page names so it works with both "./orders.html" source
// hrefs and Netlify's pretty URLs ("/orders"). Leaves the markup's default
// alone if nothing matches, instead of clearing every highlight.
function markActiveNav() {
  const current = normalizePage(window.location.pathname.split('/').pop());
  const items = [...document.querySelectorAll('.nav-item[href]:not([href="#"])')];
  const matches = items.filter((el) => normalizePage(el.getAttribute('href').split('/').pop()) === current);
  if (!matches.length) return;
  items.forEach((el) => {
    const on = matches.includes(el);
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
}

// ── Installable app (PWA) ─────────────────────────────────────────────────────
// Service workers need HTTPS (localhost is exempt for development).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

window.addEventListener('offline', () => showToast("You're offline — changes can't be saved until you reconnect", 'warn', 6000));
window.addEventListener('online', () => showToast('Back online', 'success', 2500));

// Pages restored from the back/forward cache skip script execution; make sure
// a signed-out user pressing Back doesn't see a cached CRM page.
window.addEventListener('pageshow', (e) => {
  if (e.persisted && document.getElementById('sidebar') && !localStorage.getItem('crm_token')) {
    window.location.replace('./login.html');
  }
});
