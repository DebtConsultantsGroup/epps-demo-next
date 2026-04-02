'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  LinearProgress,
  Tooltip
} from '@mui/material';
import { Search, Download, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

const CSV_COLUMNS = [
  'Date', 'CardHolderID', 'FeeID', 'FeeType', 'FeeAmount',
  'TotalRequired', 'AccountBalance', 'StatusCode', 'PaidToName', 'Description'
];

function escapeCsv(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(rows, targetDate) {
  const lines = [CSV_COLUMNS.join(','), ...rows.map(r => CSV_COLUMNS.map(c => escapeCsv(r[c])).join(','))];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pending-settlements_${targetDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

const formatCurrency = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)) return val ?? '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PendingSettlements = () => {
  const [date, setDate] = useState(getYesterday());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState(null); // null = not yet run
  const [error, setError] = useState(null);

  const runReport = async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    setProgress({ current: 0, total: 0 });

    try {
      // 1. Fetch all fees for the selected date
      const feeResp = await fetch('/api/fees/find-by-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FeeDateFrom: `${date}T00:00:00`,
          FeeDateTo: `${date}T23:59:59`
        })
      });
      if (!feeResp.ok) throw new Error(`Fee fetch failed: HTTP ${feeResp.status}`);
      const feeData = await feeResp.json();

      // 2. Normalize to array
      const feeList = feeData?.FeeList?.Fee;
      const fees = feeList ? (Array.isArray(feeList) ? feeList : [feeList]) : [];

      // 3. Filter pending settlement payments
      const pending = fees.filter(
        f => f.FeeType === 'SettlementPayment' && f.StatusCode === 'Pending'
      );

      setProgress({ current: 0, total: pending.length });

      // 4. Check balance for each
      const flagged = [];
      for (let i = 0; i < pending.length; i++) {
        const fee = pending[i];
        setProgress({ current: i + 1, total: pending.length });

        let acctBal = null;
        try {
          const chResp = await fetch('/api/cardholders/find', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardholderId: fee.CardHolderID })
          });
          if (chResp.ok) {
            const chData = await chResp.json();
            const ch = chData?.CardHolderList?.CardHolderDetail;
            acctBal = ch?.AccountBalance ?? null;
          }
        } catch {
          // leave acctBal null — still include if fee exists
        }

        const EPPS_FEE = 10;
        const feeAmt = parseFloat(fee.FeeAmount || '0');
        const totalRequired = feeAmt + EPPS_FEE;
        const balAmt = parseFloat(acctBal || '0');
        const balCoversFee = balAmt > totalRequired;

        if (!balCoversFee) {
          flagged.push({
            Date: date,
            CardHolderID: fee.CardHolderID,
            FeeID: fee.FeeID,
            FeeType: fee.FeeType,
            FeeAmount: fee.FeeAmount,
            TotalRequired: totalRequired.toFixed(2),
            AccountBalance: acctBal ?? 'N/A',
            StatusCode: fee.StatusCode,
            PaidToName: fee.PaidToName ?? '',
            Description: fee.Description ?? '',
            _balCovers: false
          });
        }
      }

      setResults({ totalFees: fees.length, pendingCount: pending.length, flagged });
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const progressPct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5">Pending Settlements — Insufficient Balance</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            Finds SettlementPayment fees with Pending status where the account balance cannot cover the fee amount.
          </Typography>
        </Box>
      </Box>

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            type="date"
            size="small"
            label="Fee Date"
            value={date}
            onChange={e => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={running}
          />
          <Button
            variant="contained"
            startIcon={running ? <CircularProgress size={16} color="inherit" /> : <Search size={16} />}
            onClick={runReport}
            disabled={running || !date}
          >
            {running ? 'Running…' : 'Run Report'}
          </Button>
          {results && results.flagged.length > 0 && (
            <Button
              variant="outlined"
              startIcon={<Download size={16} />}
              onClick={() => downloadCsv(results.flagged, date)}
            >
              Download CSV
            </Button>
          )}
        </Box>

        {/* Progress bar */}
        {running && progress.total > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="textSecondary">
              Checking balances… {progress.current} / {progress.total}
            </Typography>
            <LinearProgress variant="determinate" value={progressPct} sx={{ mt: 0.5, borderRadius: 1 }} />
          </Box>
        )}
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Summary chips */}
      {results && (
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip label={`${results.totalFees} total fees on ${date}`} variant="outlined" size="small" />
          <Chip label={`${results.pendingCount} pending SettlementPayments`} color="primary" size="small" />
          <Chip
            icon={results.flagged.length > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            label={`${results.flagged.length} insufficient balance`}
            color={results.flagged.length > 0 ? 'error' : 'success'}
            size="small"
          />
          {results.flagged.length === 0 && results.pendingCount > 0 && (
            <Typography variant="body2" color="success.main">
              All pending settlement fees have sufficient balances.
            </Typography>
          )}
        </Box>
      )}

      {/* Results table */}
      {results && results.flagged.length > 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: 'error.light' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>CardHolder ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Fee ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Fee Amount</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>+ $10 EPPS Fee</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Total Required</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Account Balance</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Shortfall</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Paid To</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {results.flagged.map((row) => {
                const totalRequired = parseFloat(row.TotalRequired || '0');
                const shortfall = totalRequired - parseFloat(row.AccountBalance === 'N/A' ? '0' : row.AccountBalance || '0');
                return (
                  <TableRow key={row.FeeID} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {row.CardHolderID}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {row.FeeID}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatCurrency(row.FeeAmount)}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>$10.00</TableCell>
                    <TableCell sx={{ color: 'error.main', fontWeight: 'bold' }}>
                      {formatCurrency(row.TotalRequired)}
                    </TableCell>
                    <TableCell>
                      {row.AccountBalance === 'N/A'
                        ? <Chip label="N/A" size="small" color="warning" />
                        : formatCurrency(row.AccountBalance)
                      }
                    </TableCell>
                    <TableCell sx={{ color: 'error.dark', fontWeight: 'bold' }}>
                      {row.AccountBalance === 'N/A' ? '—' : formatCurrency(shortfall)}
                    </TableCell>
                    <TableCell>{row.PaidToName || '—'}</TableCell>
                    <TableCell>
                      <Tooltip title={row.Description}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {row.Description || '—'}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip label={row.StatusCode} size="small" color="warning" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Empty state after run with no pending fees at all */}
      {results && results.pendingCount === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          <CheckCircle2 size={40} style={{ marginBottom: 8, color: '#34a853' }} />
          <Typography variant="h6">No pending settlement fees found for {date}</Typography>
          <Typography variant="body2">Either no fees were created that day, or none match the SettlementPayment + Pending criteria.</Typography>
        </Paper>
      )}
    </Box>
  );
};

export default PendingSettlements;
