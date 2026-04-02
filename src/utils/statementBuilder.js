'use client';

import { safeDate, formatDate, formatStatementMoney, csvEscape, normalizeFields, parseCurrency } from './csvHelpers.js';

export const EFT_STATEMENT_FIELDS = [
  'CardHolderId',
  'EftTransactionID',
  'EftDate',
  'EftAmount',
  'BankName',
  'BankCity',
  'BankState',
  'AccountNumber',
  'RoutingNumber',
  'Memo',
  'LastMessage',
  'StatusCode',
  'StatusDate',
  'CreatedDate',
  'SettledDate',
  'ReturnedDate',
  'NSFReturnCode'
];

export const FEE_STATEMENT_FIELDS = [
  'CardHolderID',
  'FeeID',
  'EftTransactionID',
  'Party',
  'FeeAmount',
  'Description',
  'Fee_Date',
  'FeeType',
  'PaidToName',
  'PaidToPhone',
  'PaidToStreet',
  'PaidToStreet2',
  'PaidToCity',
  'PaidToState',
  'PaidToZip',
  'PaidToContactName',
  'BankReferenceID',
  'AccountNumber',
  'RoutingNumber',
  'StatusCode',
  'StatusDate'
];

export const buildStatementTransactions = (eftItems, feeItems, currentBalance) => {
  const getAmountLabel = (transactionType, feeType, description) => {
    if (transactionType === 'EFT') return 'ACH Debit';

    const ft = String(feeType || '').toLowerCase().trim();
    const desc = String(description || '').toLowerCase();

    if (ft === 'settlementpayment') return 'Settlement Payment';
    if (ft === 'account adjustment' || ft === '11') return 'Account Adjustment';
    if (ft === 'vendorfee' || ft === '10' || ft === 'commission fee') return 'Debt Program';

    if (desc.includes('epps')) return 'EPPS';
    if (desc.includes('settlement check')) return 'Settlement Payment';

    return 'Debt Program';
  };

  const EFT_CREDIT_STATUSES = new Set(['settled']);
  const FEE_DEBIT_STATUSES = new Set(['transmitted', 'settled']);

  const calculateCreditDebit = (amountValue, transactionType, status) => {
    const numeric = Number.parseFloat(amountValue || 0);
    const s = String(status || '').toLowerCase().trim();

    if (transactionType === 'EFT') {
      if (!EFT_CREDIT_STATUSES.has(s)) return { credit: 0, debit: 0 };
      return { credit: Math.abs(numeric), debit: 0 };
    }
    // Fee — negative amount = refund credit regardless of status
    if (numeric < 0) return { credit: Math.abs(numeric), debit: 0 };
    if (!FEE_DEBIT_STATUSES.has(s)) return { credit: 0, debit: 0 };
    return { credit: 0, debit: numeric };
  };

  const eftTransactions = eftItems.map((eft) => {
    const { credit, debit } = calculateCreditDebit(eft.EftAmount, 'EFT', eft.StatusCode);
    return {
      type: 'EFT',
      id: eft.EftTransactionID,
      date: eft.StatusDate || eft.CreatedDate,
      transactionDate: eft.EftDate,
      amount: eft.EftAmount,
      amountLabel: getAmountLabel('EFT'),
      status: eft.StatusCode,
      statusDate: eft.StatusDate,
      feeId: '',
      eftTransactionId: eft.EftTransactionID || '',
      description: eft.Memo || eft.LastMessage || '',
      credit,
      debit,
      accountBalance: 0,
      sortDate: safeDate(eft.StatusDate || eft.CreatedDate)?.getTime() || 0,
      fieldOrder: EFT_STATEMENT_FIELDS,
      fields: normalizeFields(eft, EFT_STATEMENT_FIELDS)
    };
  });

  // Build EFT date lookup so fees can fall back to their paired EFT's date
  // when the API returns today's date for fee date fields (known EPPS API issue)
  const eftDateMap = {};
  eftItems.forEach(eft => {
    if (eft.EftTransactionID) {
      eftDateMap[String(eft.EftTransactionID)] = eft.StatusDate || eft.CreatedDate;
    }
  });

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const parseBankRefDate = (bankRefId) => {
    if (!bankRefId) return null;
    const match = String(bankRefId).match(/(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!match) return null;
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}T00:00:00`;
  };

  const getBestFeeDate = (fee) => {
    // 1. StatusDate if it's a real historical date
    const statusDate = safeDate(fee.StatusDate);
    if (statusDate && statusDate.getTime() < todayMidnight.getTime()) {
      return fee.StatusDate;
    }
    // 2. EFT-linked fees: use EFT's settlement date (StatusDate is correct for EFTs)
    const eftKey = String(fee.EftTransactionID || '');
    if (eftKey && eftDateMap[eftKey]) {
      return eftDateMap[eftKey];
    }
    // 3. Standalone Debt Program fees: transmitted date embedded in BankReferenceID
    //    e.g. "Debt Consultants Group DPF 12-22-2021" → 2021-12-22T00:00:00
    const bankRefDate = parseBankRefDate(fee.BankReferenceID);
    if (bankRefDate) {
      const parsed = safeDate(bankRefDate);
      if (parsed && parsed.getTime() < todayMidnight.getTime()) {
        return bankRefDate;
      }
    }
    // 4. Fall back to Fee_Date (EPPS transactiondate)
    const feeDate = safeDate(fee.Fee_Date);
    if (feeDate && feeDate.getTime() < todayMidnight.getTime()) {
      return fee.Fee_Date;
    }
    return fee.StatusDate || fee.Fee_Date;
  };

  const feeTransactions = feeItems.map((fee) => {
    const { credit, debit } = calculateCreditDebit(fee.FeeAmount, 'Fee', fee.StatusCode);
    const resolvedDate = getBestFeeDate(fee);
    const isSettlementCheckFee = String(fee.Description || '').toLowerCase().includes('settlement check');
    return {
      type: 'Fee',
      id: fee.FeeID,
      date: resolvedDate,
      transactionDate: fee.Fee_Date,
      amount: fee.FeeAmount,
      amountLabel: getAmountLabel('Fee', fee.FeeType, fee.Description),
      status: fee.StatusCode,
      statusDate: fee.StatusDate,
      feeId: fee.FeeID || '',
      eftTransactionId: fee.EftTransactionID || '',
      description: fee.Description || fee.FeeType || '',
      credit,
      debit,
      isSettlementCheckFee,
      accountBalance: 0,
      sortDate: safeDate(resolvedDate)?.getTime() || 0,
      fieldOrder: FEE_STATEMENT_FIELDS,
      fields: normalizeFields(fee, FEE_STATEMENT_FIELDS)
    };
  });

  const combined = [...eftTransactions, ...feeTransactions].sort((a, b) => {
    // 1. Sort by date ascending
    if (a.sortDate !== b.sortDate) return a.sortDate - b.sortDate;

    // Within the same day:
    // 2. Settlement Check Fee always first
    if (a.isSettlementCheckFee && !b.isSettlementCheckFee) return -1;
    if (!a.isSettlementCheckFee && b.isSettlementCheckFee) return 1;

    // 3. EFT (ACH Debit) second
    if (a.type === 'EFT' && b.type !== 'EFT') return -1;
    if (a.type !== 'EFT' && b.type === 'EFT') return 1;

    // 4. Credits before debits
    const aIsCredit = a.credit > 0;
    const bIsCredit = b.credit > 0;
    if (aIsCredit && !bIsCredit) return -1;
    if (!aIsCredit && bIsCredit) return 1;

    return 0;
  });

  const insertMonthlyBoundaries = (rows) => {
    if (!rows.length) return rows;
    const result = [];
    let prevMonth = null;

    for (const tx of rows) {
      const d = safeDate(tx.date);
      const rowMonth = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null;

      if (prevMonth && rowMonth && rowMonth !== prevMonth) {
        const prevBal = result[result.length - 1].accountBalance;
        const prevD = safeDate(result[result.length - 1].date);
        const endDate = new Date(prevD.getFullYear(), prevD.getMonth() + 1, 0);
        const startDate = new Date(d.getFullYear(), d.getMonth(), 1);
        result.push({
          type: 'MonthBoundary', id: null, label: 'Monthly Ending Balance',
          date: endDate.toISOString(), transactionDate: '', credit: 0, debit: 0,
          accountBalance: prevBal, status: '', statusDate: '', feeId: '', eftTransactionId: '',
          description: '', amountLabel: '', fields: {}, fieldOrder: [],
        });
        result.push({
          type: 'MonthBoundary', id: null, label: 'Monthly Beginning Balance',
          date: startDate.toISOString(), transactionDate: '', credit: 0, debit: 0,
          accountBalance: prevBal, status: '', statusDate: '', feeId: '', eftTransactionId: '',
          description: '', amountLabel: '', fields: {}, fieldOrder: [],
        });
      }
      result.push(tx);
      if (rowMonth) prevMonth = rowMonth;
    }
    return result;
  };

  if (currentBalance !== null && currentBalance !== undefined) {
    let runningBalance = currentBalance;
    for (let idx = combined.length - 1; idx >= 0; idx -= 1) {
      combined[idx].accountBalance = runningBalance;
      runningBalance = runningBalance - combined[idx].credit + combined[idx].debit;
    }
    return insertMonthlyBoundaries(combined);
  }

  let runningBalance = 0;
  const withBalances = combined.map((tx) => {
    runningBalance += tx.credit - tx.debit;
    return { ...tx, accountBalance: runningBalance };
  });
  return insertMonthlyBoundaries(withBalances);
};

export const generateStatementCSV = (statementRows) => {
  const headers = ['Transmitted Date', 'Transaction Date', 'Amount', 'Description', 'Credit', 'Debit', 'Status Code', 'Fee ID', 'Eft Transaction ID', 'Account Balance', 'Type', 'Transaction ID'];
  const rows = statementRows.map((transaction) => [
    formatDate(transaction.date),
    formatDate(transaction.transactionDate),
    transaction.amountLabel,
    transaction.description || '',
    formatStatementMoney(transaction.credit),
    formatStatementMoney(-transaction.debit),
    transaction.status || '',
    transaction.feeId || '',
    transaction.eftTransactionId || '',
    formatStatementMoney(transaction.accountBalance),
    transaction.type,
    transaction.id || '',
  ]);

  return [headers, ...rows]
    .map((rowValues) => rowValues.map(csvEscape).join(','))
    .join('\n');
};
