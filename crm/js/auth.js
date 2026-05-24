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

  if (nameEl)   nameEl.textContent   = user.name || 'Admin';
  if (roleEl)   roleEl.textContent   = user.role === 'super_admin' ? 'Super Admin' : (user.type === 'technician' ? 'Technician' : 'Admin');
  if (avatarEl) avatarEl.textContent = (user.name || 'A')[0].toUpperCase();
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
  renderUserInfo(user);
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
