/**
 * auth.js — CRM authentication guard with token-expiry handling
 */

function getToken() {
  return localStorage.getItem('crm_token');
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('crm_user')); } catch { return null; }
}

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

// Redirect to login if no valid session
function requireAuth() {
  const token = getToken();
  const user  = getUser();
  if (!token || !user || isTokenExpired(token)) {
    logout(true);
    return null;
  }
  return user;
}

// Populate user info in sidebar
function renderUserInfo(user) {
  const nameEl   = document.getElementById('sidebar-user-name');
  const roleEl   = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-user-avatar');

  const roleLabels = { super_admin: 'Super Admin', admin: 'Admin', telecaller: 'Telecaller', technician: 'Technician' };
  if (nameEl)   nameEl.textContent   = user.name || 'Admin';
  if (roleEl)   roleEl.textContent   = roleLabels[user.type === 'technician' ? 'technician' : user.role] || 'Admin';
  if (avatarEl) avatarEl.textContent = (user.name || 'A')[0].toUpperCase();
}

// Pages that expose owner-only financial data/management — never reachable by a telecaller,
// even by typing the URL directly. The backend enforces this independently on every API
// call; this redirect just keeps the telecaller out of a page that would otherwise render
// broken (every fetch on it returns 403).
const OWNER_ONLY_PAGES = [
  'index.html', 'technicians.html', 'payments.html',
  'analysis.html', 'workdone.html', 'customer-care-report.html',
];

// Normalizes a link href or the current pathname to a bare "page.html" name.
// Netlify's "Pretty URLs" post-processing rewrites served links from
// "./index.html" to "/" and "./orders.html" to "/orders" — so raw string
// comparisons against the source hrefs break in production. This undoes that.
function normalizePage(raw) {
  let p = (raw || '').split('?')[0].split('#')[0];
  p = p.replace(/^\.?\//, ''); // strip a leading "./" or "/"
  if (p === '') return 'index.html';
  if (!p.includes('.')) p += '.html'; // pretty URL ("orders" -> "orders.html")
  return p;
}

// ── Sidebar navigation ────────────────────────────────────────────────────────
// Single source of truth for the menu. Each page used to carry its own copy of
// the sidebar and they drifted apart, so links "disappeared" when you changed page.
const NAV_ICONS = {
  dashboard: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  orders: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  workdone: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  schedules: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  technicians: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  customers: 'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  payments: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  analysis: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  customercare: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  signout: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9',
};

const OWNER_NAV = [
  { label: 'Main', items: [
    { href: './index.html', icon: 'dashboard', text: 'Dashboard' },
    { href: './orders.html', icon: 'orders', text: 'Orders', badge: 'nav-pending-count' },
    { href: './workdone.html', icon: 'workdone', text: 'Work Done' },
    { href: './schedules.html', icon: 'schedules', text: 'Schedules' },
  ] },
  { label: 'Management', items: [
    { href: './technicians.html', icon: 'technicians', text: 'Technicians' },
    { href: './customers.html', icon: 'customers', text: 'Customers' },
    { href: './payments.html', icon: 'payments', text: 'Payments' },
    { href: './analysis.html', icon: 'analysis', text: 'Analysis' },
    { href: './customer-care-report.html', icon: 'customercare', text: 'Customer Care' },
  ] },
];

const TELECALLER_NAV = [
  { label: 'Main', items: [
    { href: './telecaller-dashboard.html', icon: 'dashboard', text: 'Dashboard' },
    { href: './orders.html', icon: 'orders', text: 'Orders' },
    { href: './schedules.html', icon: 'schedules', text: 'Schedules' },
    { href: './customers.html', icon: 'customers', text: 'Customers' },
  ] },
];

function navIcon(name) {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${NAV_ICONS[name]}"/></svg>`;
}

function renderSidebarNav(user) {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const sections = user.role === 'telecaller' ? TELECALLER_NAV : OWNER_NAV;
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = sections.map((section) => `
    <div class="nav-section">
      <div class="nav-label">${section.label}</div>
      ${section.items.map((item) => `
        <a href="${item.href}" class="nav-item">${navIcon(item.icon)}${item.text}${item.badge ? `<span class="nav-badge" id="${item.badge}"></span>` : ''}</a>`).join('')}
    </div>`).join('') + `
    <div class="nav-section">
      <div class="nav-label">Account</div>
      <a href="#" class="nav-item" role="button" onclick="logout();return false;">${navIcon('signout')}Sign Out</a>
    </div>`;
}

// Hide sidebar links/controls marked for the *other* role. Pages shared between
// roles (schedules.html) mark owner-only bits with data-owner-only and
// telecaller-only bits (e.g. the telecaller dashboard link) with data-telecaller-only.
function applyRoleVisibility(user) {
  const telecaller = user.role === 'telecaller';

  if (telecaller) {
    document.querySelectorAll('.nav-item[href]:not([href="#"])').forEach((el) => {
      if (OWNER_ONLY_PAGES.includes(normalizePage(el.getAttribute('href')))) el.style.display = 'none';
    });
    document.querySelectorAll('[data-owner-only]').forEach((el) => { el.style.display = 'none'; });
  } else {
    document.querySelectorAll('[data-telecaller-only]').forEach((el) => { el.style.display = 'none'; });
  }
}

function redirectIfOwnerOnlyPage(user) {
  if (user.role !== 'telecaller') return false;
  if (OWNER_ONLY_PAGES.includes(normalizePage(window.location.pathname))) {
    window.location.href = './telecaller-dashboard.html';
    return true;
  }
  return false;
}

function logout(expired = false) {
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  const redirect = './login.html' + (expired ? '?session=expired' : '');
  window.location.href = redirect;
}

// Init every dashboard page
function initCRM() {
  const user = requireAuth();
  if (!user) return null;
  if (redirectIfOwnerOnlyPage(user)) return null;
  renderUserInfo(user);
  renderSidebarNav(user);
  applyRoleVisibility(user);
  initSidebar();
  markActiveNav();
  return user;
}

// Authenticated fetch wrapper — auto-handles 401 token expiry
async function apiFetch(url, options = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    logout(true);
    throw new Error('Session expired. Please log in again.');
  }

  return res;
}
