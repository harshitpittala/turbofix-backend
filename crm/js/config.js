/**
 * config.js — CRM shared configuration
 * 
 * Environment:
 * - Production: CRM proxies /api/* to https://turbofix-backend-aqhy.onrender.com via Netlify redirects
 * - Local dev: API_BASE can be overridden via window.CRM_API_BASE before loading this script
 */

// Determine API base URL (can be overridden via window.CRM_API_BASE)
const getAPIBase = () => {
  // Allow manual override via window variable
  if (typeof window.CRM_API_BASE !== 'undefined') {
    return window.CRM_API_BASE;
  }
  
  // Production (Netlify): Use Render backend directly (bypassing redirect issues)
  if (window.location.hostname !== 'localhost') {
    return 'https://turbofix-backend-aqhy.onrender.com/api';
  }
  
  // Local development: try to connect to backend directly
  return 'http://localhost:5000/api';
};

const CRM = {
  API_BASE: getAPIBase(),

  STATUS_LABELS: {
    pending:          'Pending',
    pickup_assigned:  'Pickup Assigned',
    picked_up:        'Pickup Completed',
    under_diagnosis:  'Diagnosis Started',
    repairing:        'Repair In Progress',
    ready:            'Ready For Delivery',
    delivered:        'Delivered',
    cancelled:        'Cancelled',
  },

  // All allowed next statuses per current status (technician-facing)
  // Admins can set any status directly via the CRM status modal
  STATUS_TRANSITIONS: {
    pending:          ['pickup_assigned', 'under_diagnosis', 'cancelled'],
    pickup_assigned:  ['picked_up', 'cancelled'],
    picked_up:        ['under_diagnosis', 'cancelled'],
    under_diagnosis:  ['repairing', 'cancelled'],
    repairing:        ['ready', 'cancelled'],
    ready:            ['delivered'],
    delivered:        [],
    cancelled:        [],
  },

  PRIORITY_LABELS: { normal: 'Normal', high: 'High', urgent: 'Urgent' },
  PAYMENT_METHODS: { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank Transfer', other: 'Other' },
};
