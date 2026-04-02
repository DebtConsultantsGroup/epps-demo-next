'use client';

import { useState, useEffect, useCallback } from 'react';
import { EFT_STATUSES, FEE_STATUSES, CARDHOLDER_STATUSES, getStatusConfig } from '../constants/statusConfig';

// Helper to normalize API list responses
const normalizeList = (data, listKey, itemKey) => {
  if (!data || !data[listKey] || !data[listKey][itemKey]) return [];
  const items = data[listKey][itemKey];
  return Array.isArray(items) ? items : [items];
};

// Aggregate stats by status
const aggregateByStatus = (items, statusField, amountField, statusMap) => {
  const stats = {};

  // Initialize all known statuses with zero
  Object.values(statusMap).forEach(s => {
    stats[s.code] = { count: 0, amount: 0, ...s };
  });

  items.forEach(item => {
    const statusCode = item[statusField];
    const amount = parseFloat(item[amountField]) || 0;

    if (stats[statusCode]) {
      stats[statusCode].count += 1;
      stats[statusCode].amount += amount;
    } else {
      // Unknown status - add it
      const config = getStatusConfig(statusMap, statusCode);
      stats[statusCode] = { count: 1, amount, ...config };
    }
  });

  return stats;
};

// Filter items by date range
const filterByDateRange = (items, dateField, startDate, endDate) => {
  if (!startDate && !endDate) return items;

  return items.filter(item => {
    const itemDate = new Date(item[dateField]);
    if (startDate && itemDate < new Date(startDate)) return false;
    if (endDate && itemDate > new Date(endDate)) return false;
    return true;
  });
};

export const useDashboardStats = (cardholderId = null, dateRange = null) => {
  const [eftStats, setEftStats] = useState(null);
  const [feeStats, setFeeStats] = useState(null);
  const [cardholderStats, setCardholderStats] = useState(null);
  const [cardholders, setCardholders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let eftData, feeData, cardholderData;

      // Always fetch cardholders list for the dropdown
      const cardholderRes = await fetch('/api/cardholders/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      cardholderData = await cardholderRes.json();

      const cardholderList = normalizeList(cardholderData, 'CardHolderList', 'CardHolderDetail');
      setCardholders(cardholderList.map(ch => ({
        id: ch.CardHolderID,
        name: `${ch.FirstName} ${ch.LastName}`,
        raw: ch
      })));

      if (cardholderId) {
        // Fetch all-time data for specific cardholder (no date restrictions on API)
        const [eftRes, feeRes] = await Promise.all([
          fetch('/api/cardholders/efts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardholderId })
          }),
          fetch('/api/cardholders/fees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardholderId })
          })
        ]);

        eftData = await eftRes.json();
        feeData = await feeRes.json();

        // Process EFT data
        let eftList = normalizeList(eftData, 'EFTList', 'EFTTransactionDetail');

        // Apply client-side date filtering if specified
        if (dateRange && dateRange.startDate && dateRange.endDate) {
          eftList = filterByDateRange(eftList, 'EftDate', dateRange.startDate, dateRange.endDate);
        }

        const eftAggregated = aggregateByStatus(eftList, 'StatusCode', 'EftAmount', EFT_STATUSES);

        const totalSettled = eftAggregated['Settled']?.amount || 0;
        const totalPending = (eftAggregated['Create EFT Pending']?.amount || 0) +
                            (eftAggregated['Transmitted']?.amount || 0);
        const returnCount = eftAggregated['Returned']?.count || 0;

        setEftStats({
          byStatus: eftAggregated,
          totalCount: eftList.length,
          totalSettled,
          totalPending,
          returnCount
        });

        // Process Fee data
        let feeList = normalizeList(feeData, 'FeeList', 'Fee');

        // Apply client-side date filtering if specified
        if (dateRange && dateRange.startDate && dateRange.endDate) {
          feeList = filterByDateRange(feeList, 'Fee_Date', dateRange.startDate, dateRange.endDate);
        }

        const feeAggregated = aggregateByStatus(feeList, 'StatusCode', 'FeeAmount', FEE_STATUSES);

        const totalFees = feeList.reduce((sum, f) => sum + (parseFloat(f.FeeAmount) || 0), 0);

        setFeeStats({
          byStatus: feeAggregated,
          totalCount: feeList.length,
          totalAmount: totalFees
        });

        // For single cardholder, show their status
        const selectedCardholder = cardholderList.find(ch => ch.CardHolderID === cardholderId);
        const singleCardholderStats = {};
        Object.values(CARDHOLDER_STATUSES).forEach(s => {
          singleCardholderStats[s.code] = { count: 0, ...s };
        });
        if (selectedCardholder) {
          const status = selectedCardholder.Status || 'Created';
          if (singleCardholderStats[status]) {
            singleCardholderStats[status].count = 1;
          } else {
            const config = getStatusConfig(CARDHOLDER_STATUSES, status);
            singleCardholderStats[status] = { count: 1, ...config };
          }
        }

        setCardholderStats({
          byStatus: singleCardholderStats,
          totalCount: 1,
          selectedCardholder
        });

      } else {
        // Fetch aggregate data using date range (API has 7-day limit)
        const startDateStr = dateRange?.startDate || (() => {
          const d = new Date();
          d.setDate(d.getDate() - 6);
          return d.toISOString().split('.')[0];
        })();

        const endDateStr = dateRange?.endDate || new Date().toISOString().split('.')[0];

        const [eftRes, feeRes] = await Promise.all([
          fetch('/api/eft/status-date', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              StatusDateFrom: startDateStr,
              StatusDateTo: endDateStr
            })
          }),
          fetch('/api/fees/status-date', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              StatusDateFrom: startDateStr,
              StatusDateTo: endDateStr
            })
          })
        ]);

        eftData = await eftRes.json();
        feeData = await feeRes.json();

        // Process EFT data
        const eftList = normalizeList(eftData, 'EFTList', 'EFTTransactionDetail');
        const eftAggregated = aggregateByStatus(eftList, 'StatusCode', 'EftAmount', EFT_STATUSES);

        const totalSettled = eftAggregated['Settled']?.amount || 0;
        const totalPending = (eftAggregated['Create EFT Pending']?.amount || 0) +
                            (eftAggregated['Transmitted']?.amount || 0);
        const returnCount = eftAggregated['Returned']?.count || 0;

        setEftStats({
          byStatus: eftAggregated,
          totalCount: eftList.length,
          totalSettled,
          totalPending,
          returnCount
        });

        // Process Fee data
        const feeList = normalizeList(feeData, 'FeeList', 'Fee');
        const feeAggregated = aggregateByStatus(feeList, 'StatusCode', 'FeeAmount', FEE_STATUSES);

        const totalFees = feeList.reduce((sum, f) => sum + (parseFloat(f.FeeAmount) || 0), 0);

        setFeeStats({
          byStatus: feeAggregated,
          totalCount: feeList.length,
          totalAmount: totalFees
        });

        // Process all cardholders
        const cardholderAggregated = {};
        Object.values(CARDHOLDER_STATUSES).forEach(s => {
          cardholderAggregated[s.code] = { count: 0, ...s };
        });

        cardholderList.forEach(ch => {
          const status = ch.Status || 'Created';
          if (cardholderAggregated[status]) {
            cardholderAggregated[status].count += 1;
          } else {
            const config = getStatusConfig(CARDHOLDER_STATUSES, status);
            cardholderAggregated[status] = { count: 1, ...config };
          }
        });

        setCardholderStats({
          byStatus: cardholderAggregated,
          totalCount: cardholderList.length
        });
      }

    } catch (err) {
      console.error('Failed to fetch dashboard stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cardholderId, dateRange?.startDate, dateRange?.endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    eftStats,
    feeStats,
    cardholderStats,
    cardholders,
    loading,
    error,
    refresh: fetchStats
  };
};

export default useDashboardStats;
