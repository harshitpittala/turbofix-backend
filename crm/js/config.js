/**
 * config.js — CRM shared configuration
 */

const CRM = {
  API_BASE: window.location.origin + '/api',

  STATUS_LABELS: {
    pending:          'Pending',
    pickup_assigned:  'Pickup Assigned',
    picked_up:        'Picked Up',
    under_diagnosis:  'Under Diagnosis',
    repairing:        'Repairing',
    ready:            'Ready',
    delivered:        'Delivered',
    cancelled:        'Cancelled',
  },

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
