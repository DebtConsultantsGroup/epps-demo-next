'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Alert,
  Chip,
  Checkbox,
  TextField,
  Grid
} from '@mui/material';
import { Download, Database } from 'lucide-react';

const toArray = (value, key) => {
  if (!value || !value[key]) return [];
  return Array.isArray(value[key]) ? value[key] : [value[key]];
};

const safeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const csvEscape = (value) => {
  const strValue = String(value ?? '');
  if (/[",\n]/.test(strValue)) {
    return `"${strValue.replace(/"/g, '""')}"`;
  }
  return strValue;
};

const formatDateMMDDYYYY = (value) => {
  const d = safeDate(value);
  if (!d) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
};

const PAYMENT_FEE_TYPES = new Set(['Monthly Fee', 'Setup Fee', 'Other Fee', 'Account Adjustment']);
const SETTLEMENT_FEE_TYPES = new Set(['VendorFee', 'Commission Fee']);

const getRecordType = (feeType) => {
  if (feeType === 'SettlementPayment') return 'Settlement_Plan_Item';
  if (PAYMENT_FEE_TYPES.has(feeType)) return 'Payment_Fee';
  if (SETTLEMENT_FEE_TYPES.has(feeType)) return 'Settlement_Fee';
  return 'Payment_Fee';
};

const RECORD_TYPE_META = {
  Payment_Plan_Item: { sf_object: 'Payment_Schedule_Item__c', sf_external_id_field: 'EPPS_EFT_Transaction_Id__c' },
  Settlement_Plan_Item: { sf_object: 'Settlement_Plan_Item__c', sf_external_id_field: 'Fee_Id__c' },
  Payment_Fee: { sf_object: 'Payment_Fee__c', sf_external_id_field: 'Fee_Id__c' },
  Settlement_Fee: { sf_object: 'Settlement_Fee__c', sf_external_id_field: 'Fee_Id__c' },
};

const CSV_KEYS = [
  'record_type', 'sf_object', 'sf_external_id_field', 'sf_external_id_value',
  'cardholder_id', 'cardholder_name', 'cardholder_email', 'cardholder_phone',
  'cardholder_status', 'cardholder_account_balance',
  'eft_transaction_id', 'eft_date', 'eft_amount', 'eft_status', 'eft_status_date',
  'eft_created_date', 'eft_settled_date', 'eft_returned_date', 'eft_nsf_return_code',
  'eft_memo', 'eft_last_message',
  'fee_id', 'fee_type', 'fee_amount', 'fee_description', 'fee_date_resolved',
  'fee_date_raw', 'fee_status', 'fee_party', 'fee_bank_reference_id', 'linked_eft_id',
  'creditor_name', 'creditor_contact', 'creditor_phone',
  'creditor_street', 'creditor_street2', 'creditor_city', 'creditor_state', 'creditor_zip',
  'bank_name', 'bank_routing', 'bank_account_number', 'bank_city', 'bank_state',
  'is_latest_bank_record',
];

const CSV_DISPLAY_HEADERS = [
  '', '', '', '',
  'CardHolderID', '', 'Email', 'Phone',
  'Status', 'AccountBalance',
  'EftTransactionID', 'EftDate', 'EftAmount', 'StatusCode', 'StatusDate',
  'CreatedDate', 'SettledDate', 'ReturnedDate', 'NSFReturnCode',
  'Memo', 'LastMessage',
  'FeeID', 'FeeType', 'FeeAmount', 'Description', '',
  'Fee_Date', 'StatusCode', 'Party', 'BankReferenceID', 'EftTransactionID',
  'PaidToName', 'PaidToContactName', 'PaidToPhone',
  'PaidToStreet', 'PaidToStreet2', 'PaidToCity', 'PaidToState', 'PaidToZip',
  'BankName', 'RoutingNumber', 'AccountNumber', 'BankCity', 'BankState',
  '',
];

function buildEftDateMap(efts) {
  const map = {};
  for (const eft of efts) {
    const key = String(eft.EftTransactionID || '');
    if (key) map[key] = eft.StatusDate;
  }
  return map;
}

function parseBankRefDate(bankRefId) {
  if (!bankRefId) return null;
  const match = String(bankRefId).match(/(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}T00:00:00`;
}

function getBestFeeDate(fee, eftDateMap, todayMidnight) {
  const statusDate = safeDate(fee.StatusDate);
  if (statusDate && statusDate.getTime() < todayMidnight.getTime()) {
    return fee.StatusDate;
  }
  const eftKey = String(fee.EftTransactionID || '');
  if (eftKey && eftDateMap[eftKey]) {
    return eftDateMap[eftKey];
  }
  const bankRefDate = parseBankRefDate(fee.BankReferenceID);
  if (bankRefDate) {
    const parsed = safeDate(bankRefDate);
    if (parsed && parsed.getTime() < todayMidnight.getTime()) {
      return bankRefDate;
    }
  }
  const feeDate = safeDate(fee.Fee_Date);
  if (feeDate && feeDate.getTime() < todayMidnight.getTime()) {
    return fee.Fee_Date;
  }
  return fee.StatusDate || fee.Fee_Date;
}

function buildRows(cardholder, efts, fees) {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const eftDateMap = buildEftDateMap(efts);

  const chBase = {
    cardholder_id: cardholder.CardHolderID || '',
    cardholder_name: `${cardholder.FirstName || ''} ${cardholder.LastName || ''}`.trim(),
    cardholder_email: cardholder.Email || '',
    cardholder_phone: cardholder.Phone || cardholder.PhoneNumber || '',
    cardholder_status: cardholder.Status || '',
    cardholder_account_balance: cardholder.AccountBalance || '',
  };

  const eftRows = efts.map((eft) => {
    const rt = 'Payment_Plan_Item';
    const meta = RECORD_TYPE_META[rt];
    return {
      record_type: rt,
      sf_object: meta.sf_object,
      sf_external_id_field: meta.sf_external_id_field,
      sf_external_id_value: eft.EftTransactionID || '',
      ...chBase,
      eft_transaction_id: eft.EftTransactionID || '',
      eft_date: eft.EftDate || '',
      eft_amount: eft.EftAmount || '',
      eft_status: eft.StatusCode || '',
      eft_status_date: eft.StatusDate || '',
      eft_created_date: eft.CreatedDate || '',
      eft_settled_date: formatDateMMDDYYYY(eft.SettledDate),
      eft_returned_date: formatDateMMDDYYYY(eft.ReturnedDate),
      eft_nsf_return_code: eft.NSFReturnCode || '',
      eft_memo: eft.Memo || '',
      eft_last_message: eft.LastMessage || '',
      fee_id: '', fee_type: '', fee_amount: '', fee_description: '',
      fee_date_resolved: '', fee_date_raw: '', fee_status: '', fee_party: '',
      fee_bank_reference_id: '', linked_eft_id: '',
      creditor_name: '', creditor_contact: '', creditor_phone: '',
      creditor_street: '', creditor_street2: '', creditor_city: '', creditor_state: '', creditor_zip: '',
      bank_name: eft.BankName || '',
      bank_routing: eft.RoutingNumber || '',
      bank_account_number: eft.AccountNumber || '',
      bank_city: eft.BankCity || '',
      bank_state: eft.BankState || '',
      is_latest_bank_record: false,
      _statusDate: eft.StatusDate,
      _cardholderID: cardholder.CardHolderID,
      _sortDate: eft.StatusDate,
    };
  });

  const feeRows = fees.map((fee) => {
    const feeType = fee.FeeType || '';
    const rt = getRecordType(feeType);
    const meta = RECORD_TYPE_META[rt];
    const resolvedDate = getBestFeeDate(fee, eftDateMap, todayMidnight);

    const isSettlement = rt === 'Settlement_Plan_Item';
    return {
      record_type: rt,
      sf_object: meta.sf_object,
      sf_external_id_field: meta.sf_external_id_field,
      sf_external_id_value: fee.FeeID || '',
      ...chBase,
      eft_transaction_id: '', eft_date: '', eft_amount: '', eft_status: '', eft_status_date: '',
      eft_created_date: '', eft_settled_date: '', eft_returned_date: '', eft_nsf_return_code: '',
      eft_memo: '', eft_last_message: '',
      fee_id: fee.FeeID || '',
      fee_type: feeType,
      fee_amount: fee.FeeAmount || '',
      fee_description: fee.Description || '',
      fee_date_resolved: resolvedDate || '',
      fee_date_raw: fee.Fee_Date || '',
      fee_status: fee.StatusCode || '',
      fee_party: fee.Party || '',
      fee_bank_reference_id: fee.BankReferenceID || '',
      linked_eft_id: fee.EftTransactionID || '',
      creditor_name: isSettlement ? (fee.PaidToName || '') : '',
      creditor_contact: isSettlement ? (fee.PaidToContactName || '') : '',
      creditor_phone: isSettlement ? (fee.PaidToPhone || '') : '',
      creditor_street: isSettlement ? (fee.PaidToStreet || '') : '',
      creditor_street2: isSettlement ? (fee.PaidToStreet2 || '') : '',
      creditor_city: isSettlement ? (fee.PaidToCity || '') : '',
      creditor_state: isSettlement ? (fee.PaidToState || '') : '',
      creditor_zip: isSettlement ? (fee.PaidToZip || '') : '',
      bank_name: '',
      bank_routing: isSettlement ? (fee.RoutingNumber || '') : '',
      bank_account_number: isSettlement ? (fee.AccountNumber || '') : '',
      bank_city: '',
      bank_state: '',
      is_latest_bank_record: false,
      _resolvedDate: resolvedDate,
      _accountNumber: fee.AccountNumber || '',
      _routingNumber: fee.RoutingNumber || '',
      _isSettlement: isSettlement,
      _sortDate: fee.StatusDate,
    };
  });

  return { eftRows, feeRows };
}

function applyLatestBankFlags(allRows) {
  // EFT rows: latest per cardholder_id by StatusDate
  const eftRowsByCardholder = {};
  for (const row of allRows) {
    if (row.record_type !== 'Payment_Plan_Item') continue;
    const cid = row._cardholderID;
    if (!eftRowsByCardholder[cid]) eftRowsByCardholder[cid] = [];
    eftRowsByCardholder[cid].push(row);
  }
  for (const rows of Object.values(eftRowsByCardholder)) {
    rows.sort((a, b) => {
      const da = safeDate(a._statusDate)?.getTime() || 0;
      const db = safeDate(b._statusDate)?.getTime() || 0;
      return db - da;
    });
    if (rows.length > 0) rows[0].is_latest_bank_record = true;
  }

  // Settlement rows: latest per accountNumber+routingNumber by resolvedDate
  const settlementRowsByBank = {};
  for (const row of allRows) {
    if (row.record_type !== 'Settlement_Plan_Item') continue;
    const bankKey = `${row._accountNumber}|${row._routingNumber}`;
    if (!bankKey || bankKey === '|') continue;
    if (!settlementRowsByBank[bankKey]) settlementRowsByBank[bankKey] = [];
    settlementRowsByBank[bankKey].push(row);
  }
  for (const rows of Object.values(settlementRowsByBank)) {
    rows.sort((a, b) => {
      const da = safeDate(a._resolvedDate)?.getTime() || 0;
      const db = safeDate(b._resolvedDate)?.getTime() || 0;
      return db - da;
    });
    if (rows.length > 0) rows[0].is_latest_bank_record = true;
  }
}

function generateCSV(allRows) {
  const dataRows = allRows.map((row) =>
    CSV_KEYS.map((col) => csvEscape(row[col] ?? ''))
  );
  return [CSV_DISPLAY_HEADERS.map(csvEscape), ...dataRows]
    .map((r) => r.join(','))
    .join('\n');
}

function triggerDownload(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export default function SalesforceExport() {
  const [status, setStatus] = useState('idle'); // idle | loading-list | selecting | loading-data | done | error
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [allRows, setAllRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [counts, setCounts] = useState(null);
  const [cardholders, setCardholders] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  // Derived values
  const filteredCardholders = cardholders.filter((ch) => {
    const lowerFilter = filterText.toLowerCase();
    const name = `${ch.FirstName || ''} ${ch.LastName || ''}`.toLowerCase();
    const id = (ch.CardHolderID || '').toLowerCase();
    const email = (ch.Email || '').toLowerCase();
    const matchesText = !lowerFilter || name.includes(lowerFilter) || id.includes(lowerFilter) || email.includes(lowerFilter);
    const matchesStatus = filterStatus === 'All' || ch.Status === filterStatus;
    return matchesText && matchesStatus;
  });

  const selectedCount = selectedIds.size;
  const allFilteredSelected = filteredCardholders.length > 0 && filteredCardholders.every((ch) => selectedIds.has(ch.CardHolderID));
  const someFilteredSelected = filteredCardholders.some((ch) => selectedIds.has(ch.CardHolderID));

  // Step 1: Load cardholder list
  const handleLoadCardholders = async () => {
    setStatus('loading-list');
    setProgress(0);
    setProgressText('Loading cardholder list...');
    setWarnings([]);
    setAllRows([]);
    setCounts(null);
    setCardholders([]);
    setSelectedIds(new Set());
    setFilterText('');
    setFilterStatus('All');

    try {
      const res = await fetch('/api/cardholders/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      const list = toArray(data.CardHolderList, 'CardHolderDetail');

      if (list.length === 0) {
        setStatus('done');
        setProgressText('No cardholders found.');
        setCounts({ Payment_Plan_Item: 0, Settlement_Plan_Item: 0, Payment_Fee: 0, Settlement_Fee: 0 });
        return;
      }

      setCardholders(list);
      setSelectedIds(new Set(list.map((ch) => ch.CardHolderID)));
      setProgress(100);
      setProgressText(`Found ${list.length} cardholder(s). Select the ones to include in the export.`);
      setStatus('selecting');
    } catch (err) {
      setStatus('error');
      setProgressText('Failed to load cardholders.');
    }
  };

  // Step 3: Load EFTs/fees for selected cardholders
  const handleLoadData = async () => {
    const selected = cardholders.filter((ch) => selectedIds.has(ch.CardHolderID));

    if (selected.length === 0) {
      setStatus('error');
      setProgressText('No cardholders selected. Please select at least one.');
      return;
    }

    setStatus('loading-data');
    setProgress(0);
    setProgressText(`Loading EFTs and fees for ${selected.length} cardholder(s)...`);
    setWarnings([]);
    setAllRows([]);
    setCounts(null);

    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 400;
    const warningsList = [];
    const combinedRows = [];
    let completed = 0;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < selected.length; i += BATCH_SIZE) {
      if (i > 0) await sleep(BATCH_DELAY_MS);
      const batch = selected.slice(i, i + BATCH_SIZE);
      setProgressText(`Fetching EFTs and fees for cardholders ${i + 1}–${Math.min(i + BATCH_SIZE, selected.length)} of ${selected.length}...`);

      const results = await Promise.all(
        batch.map(async (ch) => {
          const cid = ch.CardHolderID;
          try {
            const [eftRes, feeRes] = await Promise.all([
              fetch('/api/cardholders/efts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardholderId: cid })
              }),
              fetch('/api/cardholders/fees-detailed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardholderId: cid })
              })
            ]);
            const [eftData, feeData] = await Promise.all([eftRes.json(), feeRes.json()]);
            const efts = toArray(eftData.EFTList, 'EFTTransactionDetail');
            const fees = toArray(feeData.FeeList, 'Fee2');
            return { ch, efts, fees, ok: true };
          } catch (err) {
            return { ch, ok: false, error: err.message };
          }
        })
      );

      for (const result of results) {
        if (!result.ok) {
          warningsList.push(`Failed to fetch data for cardholder ${result.ch.CardHolderID}: ${result.error}`);
          continue;
        }
        const { ch, efts, fees } = result;
        const { eftRows, feeRows } = buildRows(ch, efts, fees);
        combinedRows.push(...eftRows, ...feeRows);
      }

      completed += batch.length;
      setProgress(Math.round((completed / selected.length) * 100));
    }

    applyLatestBankFlags(combinedRows);

    combinedRows.sort((a, b) => {
      const cidA = a.cardholder_id || '';
      const cidB = b.cardholder_id || '';
      if (cidA !== cidB) return cidA.localeCompare(cidB);
      const dateA = safeDate(a._sortDate)?.getTime() || 0;
      const dateB = safeDate(b._sortDate)?.getTime() || 0;
      return dateA - dateB;
    });

    const countMap = {
      Payment_Plan_Item: 0,
      Settlement_Plan_Item: 0,
      Payment_Fee: 0,
      Settlement_Fee: 0,
    };
    for (const row of combinedRows) {
      if (countMap[row.record_type] !== undefined) countMap[row.record_type]++;
    }

    setAllRows(combinedRows);
    setCounts(countMap);
    setWarnings(warningsList);
    setProgress(100);
    setProgressText(`Done. ${combinedRows.length} total rows across ${selected.length} cardholder(s).`);
    setStatus('done');
  };

  // Selection handlers
  const handleToggleCardholder = (cardHolderID) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardHolderID)) {
        next.delete(cardHolderID);
      } else {
        next.add(cardHolderID);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const ch of filteredCardholders) next.delete(ch.CardHolderID);
      } else {
        for (const ch of filteredCardholders) next.add(ch.CardHolderID);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(cardholders.map((ch) => ch.CardHolderID)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleDownload = () => {
    const csv = generateCSV(allRows);
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    triggerDownload(csv, `epps-salesforce-export-${dateStr}.csv`);
  };

  const totalRows = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const isLoading = status === 'loading-list' || status === 'loading-data';

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Database size={28} />
        <Box>
          <Typography variant="h5" fontWeight="bold">Salesforce Bulk Export</Typography>
          <Typography variant="body2" color="text.secondary">
            Export EFT and fee data for selected cardholders into a single flat CSV for Salesforce import.
          </Typography>
        </Box>
      </Box>

      {/* Step 1 — Load Cardholder List */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>Step 1 — Load Cardholder List</Typography>
        <Button
          variant="contained"
          onClick={handleLoadCardholders}
          disabled={isLoading}
          startIcon={<Database size={18} />}
          sx={{ mb: 2 }}
        >
          {status === 'loading-list' ? 'Loading...' : 'Load Cardholders'}
        </Button>

        {status === 'loading-list' && (
          <Box sx={{ mt: 1 }}>
            <LinearProgress sx={{ mb: 1, height: 8, borderRadius: 4 }} />
            <Typography variant="body2" color="text.secondary">{progressText}</Typography>
          </Box>
        )}
      </Paper>

      {/* Step 2 — Select Clients */}
      {(status === 'selecting' || status === 'loading-data' || status === 'done') && cardholders.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold">Step 2 — Select Clients</Typography>
            <Chip
              label={`${selectedCount} of ${cardholders.length} selected`}
              color={selectedCount > 0 ? 'primary' : 'default'}
              size="small"
            />
          </Box>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField
                fullWidth
                size="small"
                label="Search by ID, name, or email"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                disabled={status === 'loading-data'}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Status"
                SelectProps={{ native: true }}
                InputLabelProps={{ shrink: true }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                disabled={status === 'loading-data'}
              >
                <option value="All">All Statuses</option>
                <option value="Created">Created</option>
                <option value="Pending">Pending</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Closed">Closed</option>
              </TextField>
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button size="small" variant="outlined" onClick={handleSelectAll} disabled={status === 'loading-data'}>
              Select All
            </Button>
            <Button size="small" variant="outlined" onClick={handleDeselectAll} disabled={status === 'loading-data'}>
              Deselect All
            </Button>
          </Box>

          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={someFilteredSelected && !allFilteredSelected}
                      checked={allFilteredSelected}
                      onChange={handleToggleAll}
                      disabled={status === 'loading-data'}
                    />
                  </TableCell>
                  <TableCell><strong>ID</strong></TableCell>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Email</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell align="right"><strong>Balance</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredCardholders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                      No cardholders match the current filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCardholders.map((ch) => (
                    <TableRow
                      key={ch.CardHolderID}
                      hover
                      onClick={status !== 'loading-data' ? () => handleToggleCardholder(ch.CardHolderID) : undefined}
                      sx={{ cursor: status !== 'loading-data' ? 'pointer' : 'default' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.has(ch.CardHolderID)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleToggleCardholder(ch.CardHolderID)}
                          disabled={status === 'loading-data'}
                        />
                      </TableCell>
                      <TableCell>{ch.CardHolderID}</TableCell>
                      <TableCell>{`${ch.FirstName || ''} ${ch.LastName || ''}`.trim()}</TableCell>
                      <TableCell>{ch.Email || '-'}</TableCell>
                      <TableCell>
                        <Chip label={ch.Status || 'Unknown'} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">${ch.AccountBalance || '0.00'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              onClick={handleLoadData}
              disabled={selectedCount === 0 || status === 'loading-data'}
              startIcon={<Database size={18} />}
            >
              {status === 'loading-data'
                ? 'Loading...'
                : `Load Data for ${selectedCount} Selected Client${selectedCount !== 1 ? 's' : ''}`}
            </Button>
          </Box>

          {status === 'loading-data' && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ mb: 1, height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary">{progressText}</Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Error display */}
      {status === 'error' && (
        <Alert severity="error" sx={{ mb: 3 }}>{progressText}</Alert>
      )}

      {/* Step 3 — Summary & Download */}
      {counts && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>Step 3 — Summary & Download</Typography>
          <TableContainer>
            <Table size="small" sx={{ maxWidth: 480 }}>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Record Type</strong></TableCell>
                  <TableCell align="right"><strong>Count</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Payment Plan Items (EFTs)</TableCell>
                  <TableCell align="right">
                    <Chip label={counts.Payment_Plan_Item.toLocaleString()} size="small" color="primary" variant="outlined" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Settlement Plan Items</TableCell>
                  <TableCell align="right">
                    <Chip label={counts.Settlement_Plan_Item.toLocaleString()} size="small" color="success" variant="outlined" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Payment Fees</TableCell>
                  <TableCell align="right">
                    <Chip label={counts.Payment_Fee.toLocaleString()} size="small" color="warning" variant="outlined" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Settlement Fees</TableCell>
                  <TableCell align="right">
                    <Chip label={counts.Settlement_Fee.toLocaleString()} size="small" color="secondary" variant="outlined" />
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  <TableCell><strong>Total rows</strong></TableCell>
                  <TableCell align="right">
                    <Chip label={totalRows.toLocaleString()} size="small" color="default" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              color="success"
              startIcon={<Download size={18} />}
              onClick={handleDownload}
              disabled={allRows.length === 0}
              size="large"
            >
              Download CSV
            </Button>
          </Box>
        </Paper>
      )}

      {warnings.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" color="warning.main" sx={{ mb: 1 }}>
            Warnings ({warnings.length})
          </Typography>
          {warnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 1 }}>
              {w}
            </Alert>
          ))}
        </Paper>
      )}
    </Box>
  );
}
