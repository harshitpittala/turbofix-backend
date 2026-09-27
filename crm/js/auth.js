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
  'index.html', '', 'technicians.html', 'payments.html',
  'analysis.html', 'workdone.html', 'customer-care-report.html',
];

// Hide sidebar links/controls marked for the *other* role. Pages shared between
// roles (schedules.html) mark owner-only bits with data-owner-only and
// telecaller-only bits (e.g. the telecaller dashboard link) with data-telecaller-only.
function applyRoleVisibility(user) {
  const telecaller = user.role === 'telecaller';

  if (telecaller) {
    document.querySelectorAll('.nav-item[href]').forEach((el) => {
      const href = el.getAttribute('href').replace(/^\.\//, '');
      if (OWNER_ONLY_PAGES.includes(href)) el.style.display = 'none';
    });
    document.querySelectorAll('[data-owner-only]').forEach((el) => { el.style.display = 'none'; });
  } else {
    document.querySelectorAll('[data-telecaller-only]').forEach((el) => { el.style.display = 'none'; });
  }
}

function redirectIfOwnerOnlyPage(user) {
  if (user.role !== 'telecaller') return false;
  const page = window.location.pathname.split('/').pop();
  if (OWNER_ONLY_PAGES.includes(page)) {
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
