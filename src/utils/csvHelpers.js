'use client';

export const toArray = (value, key) => {
  if (!value || !value[key]) return [];
  return Array.isArray(value[key]) ? value[key] : [value[key]];
};

export const safeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDate = (value) => {
  const parsed = safeDate(value);
  return parsed ? parsed.toLocaleDateString() : value || '-';
};

export const parseCurrency = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/[$,]/g, '');
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

export const formatStatementMoney = (value) => {
  if (value === null || value === undefined || value === '') return '0.00';
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const csvEscape = (value) => {
  const strValue = String(value ?? '');
  if (/[",\n]/.test(strValue)) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }
  return strValue;
};

export const normalizeFields = (item, fields) => fields.reduce((acc, field) => {
  acc[field] = item?.[field] ?? '';
  return acc;
}, {});
