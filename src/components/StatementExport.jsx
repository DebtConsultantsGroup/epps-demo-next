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
import { FileText } from 'lucide-react';
import { toArray, parseCurrency } from '../utils/csvHelpers';
import { buildStatementTransactions, generateStatementCSV } from '../utils/statementBuilder';

export default function StatementExport() {
  const [status, setStatus] = useState('idle'); // idle | loading-list | selecting | exporting | done | error
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [cardholders, setCardholders] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [outputDir, setOutputDir] = useState('./output/statements');
  const [exportResults, setExportResults] = useState([]);
  const [warnings, setWarnings] = useState([]);

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
    setExportResults([]);
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
        return;
      }

      setCardholders(list);
      setSelectedIds(new Set(list.map((ch) => ch.CardHolderID)));
      setProgress(100);
      setProgressText(`Found ${list.length} cardholder(s). Select the ones to export.`);
      setStatus('selecting');
    } catch (err) {
      setStatus('error');
      setProgressText('Failed to load cardholders.');
    }
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

  // Step 3: Export statements
  const handleExportStatements = async () => {
    const selected = cardholders.filter((ch) => selectedIds.has(ch.CardHolderID));

    if (selected.length === 0) {
      setStatus('error');
      setProgressText('No cardholders selected.');
      return;
    }

    if (!outputDir.trim()) {
      setStatus('error');
      setProgressText('Please enter an output directory.');
      return;
    }

    setStatus('exporting');
    setProgress(0);
    setProgressText(`Exporting statements for ${selected.length} cardholder(s)...`);
    setWarnings([]);
    setExportResults([]);

    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 400;
    const results = [];
    const warningsList = [];
    let completed = 0;

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const sanitizeFilename = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

    for (let i = 0; i < selected.length; i += BATCH_SIZE) {
      if (i > 0) await sleep(BATCH_DELAY_MS);
      const batch = selected.slice(i, i + BATCH_SIZE);
      setProgressText(`Exporting statements ${i + 1}\u2013${Math.min(i + BATCH_SIZE, selected.length)} of ${selected.length}...`);

      const batchResults = await Promise.all(
        batch.map(async (ch) => {
          const cid = ch.CardHolderID;
          try {
            // Fetch EFTs and fees
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
            const eftList = toArray(eftData.EFTList, 'EFTTransactionDetail');
            const feeList = toArray(feeData.FeeList, 'Fee2');

            // Build statement and generate CSV
            const statementRows = buildStatementTransactions(eftList, feeList, parseCurrency(ch.AccountBalance));
            const csvContent = generateStatementCSV(statementRows);

            // Build filename
            const firstName = sanitizeFilename(ch.FirstName || '');
            const lastName = sanitizeFilename(ch.LastName || '');
            const filename = `statement-${cid}-${firstName}-${lastName}.csv`;

            // Save to disk via API
            const saveRes = await fetch('/api/export/statement', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ csvContent, filename, outputDir: outputDir.trim() })
            });
            const saveData = await saveRes.json();

            if (!saveRes.ok) {
              return { cid, name: `${ch.FirstName} ${ch.LastName}`, success: false, error: saveData.error || 'Unknown error' };
            }

            return { cid, name: `${ch.FirstName} ${ch.LastName}`, success: true, filePath: saveData.filePath, rows: statementRows.length };
          } catch (err) {
            return { cid, name: `${ch.FirstName} ${ch.LastName}`, success: false, error: err.message };
          }
        })
      );

      for (const result of batchResults) {
        results.push(result);
        if (!result.success) {
          warningsList.push(`Failed to export ${result.cid} (${result.name}): ${result.error}`);
        }
      }

      completed += batch.length;
      setProgress(Math.round((completed / selected.length) * 100));
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    setExportResults(results);
    setWarnings(warningsList);
    setProgress(100);
    setProgressText(`Done. ${successCount} statement(s) exported${failCount > 0 ? `, ${failCount} failed` : ''}.`);
    setStatus('done');
  };

  const isLoading = status === 'loading-list' || status === 'exporting';

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <FileText size={28} />
        <Box>
          <Typography variant="h5" fontWeight="bold">Statement Export</Typography>
          <Typography variant="body2" color="text.secondary">
            Export individual client statement CSVs to a local directory.
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
          startIcon={<FileText size={18} />}
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

      {/* Step 2 — Select Clients & Export */}
      {(status === 'selecting' || status === 'exporting' || status === 'done') && cardholders.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" fontWeight="bold">Step 2 — Select Clients & Export</Typography>
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
                disabled={status === 'exporting'}
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
                disabled={status === 'exporting'}
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
            <Button size="small" variant="outlined" onClick={handleSelectAll} disabled={status === 'exporting'}>
              Select All
            </Button>
            <Button size="small" variant="outlined" onClick={handleDeselectAll} disabled={status === 'exporting'}>
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
                      disabled={status === 'exporting'}
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
                      onClick={status !== 'exporting' ? () => handleToggleCardholder(ch.CardHolderID) : undefined}
                      sx={{ cursor: status !== 'exporting' ? 'pointer' : 'default' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.has(ch.CardHolderID)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleToggleCardholder(ch.CardHolderID)}
                          disabled={status === 'exporting'}
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

          <TextField
            fullWidth
            size="small"
            label="Output Directory"
            value={outputDir}
            onChange={(e) => setOutputDir(e.target.value)}
            disabled={status === 'exporting'}
            helperText="Absolute or relative path where statement CSVs will be saved"
            sx={{ mt: 2, mb: 2 }}
          />

          <Box>
            <Button
              variant="contained"
              onClick={handleExportStatements}
              disabled={selectedCount === 0 || status === 'exporting'}
              startIcon={<FileText size={18} />}
            >
              {status === 'exporting'
                ? 'Exporting...'
                : `Export Statements for ${selectedCount} Selected Client${selectedCount !== 1 ? 's' : ''}`}
            </Button>
          </Box>

          {status === 'exporting' && (
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

      {/* Step 3 — Summary */}
      {exportResults.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>Step 3 — Summary</Typography>

          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Chip
              label={`${exportResults.filter((r) => r.success).length} succeeded`}
              color="success"
              size="small"
            />
            {exportResults.filter((r) => !r.success).length > 0 && (
              <Chip
                label={`${exportResults.filter((r) => !r.success).length} failed`}
                color="error"
                size="small"
              />
            )}
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>CardHolderID</strong></TableCell>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell align="right"><strong>Rows</strong></TableCell>
                  <TableCell><strong>File Path</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exportResults.map((result) => (
                  <TableRow key={result.cid}>
                    <TableCell>{result.cid}</TableCell>
                    <TableCell>{result.name}</TableCell>
                    <TableCell>
                      {result.success ? (
                        <Chip label="OK" color="success" size="small" variant="outlined" />
                      ) : (
                        <Chip label="Failed" color="error" size="small" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell align="right">{result.success ? result.rows : '-'}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {result.success ? result.filePath : result.error}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
