/**
 * utils.js — Shared CRM utilities
 */

// ── API helper ────────────────────────────────────────────────────────────────
async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('crm_token');
  const url   = CRM.API_BASE + endpoint;

  const defaultHeaders = { 'Content-Type': 'application/json' };
  if (token) defaultHeaders['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(url, {
    headers: { ...defaultHeaders, ...(options.headers || {}) },
    ...options,
  });

  const data = await resp.json().catch(() => ({ success: false, message: 'Invalid response' }));

  if (resp.status === 401) {
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    window.location.href = '/login.html';
    return null;
  }

  return { ok: resp.ok, status: resp.status, data };
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
  toast.innerHTML = `${icons[type] || icons.info}<span class="toast-msg">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
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
  html += `<button class="page-btn" onclick="${onPageChange}(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;

  const start = Math.max(1, page - 2);
  const end   = Math.min(pages, page + 2);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="${onPageChange}(${page + 1})" ${page >= pages ? 'disabled' : ''}>›</button>`;

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

  const close = () => {
    sidebar.classList.remove('open');
    backdrop.style.display = 'none';
  };
  const open = () => {
    sidebar.classList.add('open');
    backdrop.style.display = window.innerWidth <= 900 ? 'block' : 'none';
  };

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? close() : open();
  });
  backdrop.addEventListener('click', close);
}

// ── Mark active nav ───────────────────────────────────────────────────────────
function markActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('href') === path);
  });
}
