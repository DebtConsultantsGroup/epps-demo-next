// Status configuration for EFT, Fee, and Cardholder statuses
// Used for dashboard visualizations and status breakdowns

export const EFT_STATUSES = {
  CREATE_EFT_PENDING: { code: 'Create EFT Pending', label: 'Pending', color: '#1a73e8' },
  TRANSMITTED: { code: 'Transmitted', label: 'Transmitted', color: '#fb8c00' },
  SETTLED: { code: 'Settled', label: 'Settled', color: '#34a853' },
  RETURNED: { code: 'Returned', label: 'Returned', color: '#d32f2f' },
  VOIDED: { code: 'Voided', label: 'Voided', color: '#9e9e9e' }
};

export const FEE_STATUSES = {
  PENDING: { code: 'Pending', label: 'Pending', color: '#1a73e8' },
  TRANSMITTED: { code: 'Transmitted', label: 'Transmitted', color: '#fb8c00' },
  SETTLED: { code: 'Settled', label: 'Settled', color: '#34a853' },
  VOIDED: { code: 'Voided', label: 'Voided', color: '#9e9e9e' }
};

export const CARDHOLDER_STATUSES = {
  CREATED: { code: 'Created', label: 'Created', color: '#34a853' },
  PENDING: { code: 'Pending', label: 'Pending', color: '#1a73e8' },
  ACTIVE: { code: 'Active', label: 'Active', color: '#34a853' },
  SUSPENDED: { code: 'Suspended', label: 'Suspended', color: '#fb8c00' },
  CLOSED: { code: 'Closed', label: 'Closed', color: '#9e9e9e' }
};

// Helper to get status config by code
export const getStatusConfig = (statusMap, code) => {
  const entry = Object.values(statusMap).find(s => s.code === code);
  return entry || { code, label: code, color: '#9e9e9e' };
};

// Get all status codes as array for a given status map
export const getStatusCodes = (statusMap) => {
  return Object.values(statusMap).map(s => s.code);
};
