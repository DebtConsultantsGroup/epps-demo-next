'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Alert,
  Divider,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stepper,
  Step,
  StepLabel,
  Autocomplete,
  InputAdornment
} from '@mui/material';
import { DollarSign, Send, CheckCircle, AlertCircle, FileText, Upload, ListChecks } from 'lucide-react';

const CSV_HEADERS = [
  'CardHolderID',
  'AmountReceived',
  'DateReceived',
  'ProgramFee',
  'SetupFee',
  'WireFee',
  'SenderName',
  'Reference'
];

const BULK_SAMPLE_PATH = '/csv/wire-payments-bulk-sandbox.csv';

const todayIso = () => new Date().toISOString().split('T')[0];

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

const parseMoney = (value, fallback = 0) => {
  const normalized = String(value ?? '').replace(/[$,\s]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const WirePaymentProcessing = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [cardholders, setCardholders] = useState([]);
  const [selectedCardholder, setSelectedCardholder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Wire receipt form
  const [wireForm, setWireForm] = useState({
    amountReceived: '',
    dateReceived: todayIso(),
    senderName: '',
    reference: ''
  });

  // Fee calculation
  const [fees, setFees] = useState({
    programFee: '',
    setupFee: '',
    wireFee: '10.00' // Default wire processing fee
  });

  // Processing results
  const [results, setResults] = useState({
    vendorFee: null,
    wireFeeResult: null,
    adjustment: null
  });

  // Bulk CSV state
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkMessage, setBulkMessage] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResults, setBulkResults] = useState([]);

  const steps = ['Select Client', 'Enter Wire Details', 'Calculate Fees', 'Review & Generate'];

  // Fetch cardholders on mount
  useEffect(() => {
    fetchCardholders();
  }, []);

  const fetchCardholders = async () => {
    try {
      const response = await fetch('/api/cardholders/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();

      if (data.CardHolderList && data.CardHolderList.CardHolderDetail) {
        const details = Array.isArray(data.CardHolderList.CardHolderDetail)
          ? data.CardHolderList.CardHolderDetail
          : [data.CardHolderList.CardHolderDetail];

        setCardholders(details.map(ch => ({
          id: ch.CardHolderID,
          label: `${`${ch.FirstName || ''} ${ch.LastName || ''}`.trim() || 'Unknown'} (${ch.CardHolderID})`,
          name: `${ch.FirstName || ''} ${ch.LastName || ''}`.trim() || 'Unknown',
          balance: ch.AccountBalance || '0.00',
          raw: ch
        })));
      }
    } catch (err) {
      console.error('Failed to fetch cardholders:', err);
    }
  };

  // Calculate net amount after fees
  const calculateNetAmount = () => {
    const received = parseFloat(wireForm.amountReceived) || 0;
    const program = parseFloat(fees.programFee) || 0;
    const setup = parseFloat(fees.setupFee) || 0;
    return (received - program - setup).toFixed(2);
  };

  const getTotalFees = () => {
    const program = parseFloat(fees.programFee) || 0;
    const setup = parseFloat(fees.setupFee) || 0;
    return (program + setup).toFixed(2);
  };

  const submitFee = async (payload) => {
    const response = await fetch('/api/fees/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return { response, data };
  };

  const processWireForCardholder = async ({
    cardHolderId,
    amountReceived,
    dateReceived,
    programFee,
    setupFee,
    wireFee,
    senderName,
    reference
  }) => {
    const normalizedDate = dateReceived || todayIso();
    const totalFees = Number.parseFloat((programFee + setupFee).toFixed(2));
    const netAmount = Number.parseFloat((amountReceived - totalFees).toFixed(2));
    const dateStr = normalizedDate.replace(/-/g, '/');
    const detailSuffix = [senderName, reference].filter(Boolean).join(' | ');

    if (netAmount <= 0) {
      return {
        success: false,
        vendorFee: null,
        wireFeeResult: null,
        adjustment: null,
        totalFees: totalFees.toFixed(2),
        netAmount: netAmount.toFixed(2),
        errorMessage: 'Net amount must be greater than 0. Check AmountReceived, ProgramFee, and SetupFee.'
      };
    }

    let vendorFeeData = null;
    let wireFeeData = null;
    let adjustmentData = null;

    if (totalFees > 0) {
      const vendorFeePayload = {
        CardHolderID: cardHolderId,
        FeeDate: `${normalizedDate}T00:00:00`,
        FeeAmount: totalFees.toFixed(2),
        Description: `Wire ${dateStr} - Fees`,
        FeeType: 'Account Adjustment'
      };

      const { data } = await submitFee(vendorFeePayload);
      vendorFeeData = data;
    }

    if (wireFee > 0) {
      const wireFeePayload = {
        CardHolderID: cardHolderId,
        FeeDate: `${normalizedDate}T00:00:00`,
        FeeAmount: wireFee.toFixed(2),
        Description: detailSuffix ? `Wire Received Fee - ${detailSuffix}` : 'Wire Received Fee',
        FeeType: 'Account Adjustment'
      };

      const { data } = await submitFee(wireFeePayload);
      wireFeeData = data;
    }

    const adjustmentPayload = {
      CardHolderID: cardHolderId,
      FeeDate: `${normalizedDate}T00:00:00`,
      FeeAmount: `-${netAmount.toFixed(2)}`,
      Description: detailSuffix ? `Wire ${dateStr} - ${detailSuffix}` : `Wire ${dateStr}`,
      FeeType: 'Account Adjustment'
    };

    const { data: adjustment } = await submitFee(adjustmentPayload);
    adjustmentData = adjustment;

    const success = (adjustmentData?.StatusCode === 'Success' || adjustmentData?.FeeID) ||
                    (vendorFeeData?.StatusCode === 'Success' || vendorFeeData?.FeeID) ||
                    (wireFeeData?.StatusCode === 'Success' || wireFeeData?.FeeID);

    return {
      success,
      vendorFee: vendorFeeData,
      wireFeeResult: wireFeeData,
      adjustment: adjustmentData,
      totalFees: totalFees.toFixed(2),
      netAmount: netAmount.toFixed(2),
      errorMessage: success
        ? null
        : adjustmentData?.Message || wireFeeData?.Message || vendorFeeData?.Message || 'Unknown error'
    };
  };

  const handleNext = () => {
    if (activeStep === 0 && !selectedCardholder) {
      setMessage({ type: 'error', text: 'Please select a client' });
      return;
    }
    if (activeStep === 1 && !wireForm.amountReceived) {
      setMessage({ type: 'error', text: 'Please enter the amount received' });
      return;
    }
    setMessage(null);
    setActiveStep(prev => prev + 1);
  };

  const handleBack = () => {
    setMessage(null);
    setActiveStep(prev => prev - 1);
  };

  const handleProcessWire = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const outcome = await processWireForCardholder({
        cardHolderId: selectedCardholder.id,
        amountReceived: parseMoney(wireForm.amountReceived, 0),
        dateReceived: wireForm.dateReceived,
        programFee: parseMoney(fees.programFee, 0),
        setupFee: parseMoney(fees.setupFee, 0),
        wireFee: parseMoney(fees.wireFee, 0),
        senderName: wireForm.senderName,
        reference: wireForm.reference
      });

      setResults({
        vendorFee: outcome.vendorFee,
        wireFeeResult: outcome.wireFeeResult,
        adjustment: outcome.adjustment
      });

      if (outcome.success) {
        setMessage({
          type: 'success',
          text: 'Wire processed successfully! Account adjusted.'
        });
        setActiveStep(4);
      } else {
        setMessage({
          type: 'error',
          text: `Error: ${outcome.errorMessage || 'Unknown error'}`
        });
      }
    } catch (err) {
      console.error('Processing failed:', err);
      setMessage({ type: 'error', text: 'Network error processing wire' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setActiveStep(0);
    setSelectedCardholder(null);
    setWireForm({
      amountReceived: '',
      dateReceived: todayIso(),
      senderName: '',
      reference: ''
    });
    setFees({
      programFee: '',
      setupFee: '',
      wireFee: '10.00'
    });
    setResults({ vendorFee: null, wireFeeResult: null, adjustment: null });
    setMessage(null);
  };

  const parseBulkRows = (csvText) => {
    const lines = csvText
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (!lines.length) {
      throw new Error('CSV file is empty.');
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.trim());
    const missingHeaders = CSV_HEADERS.filter((requiredHeader) => !headers.includes(requiredHeader));
    if (missingHeaders.length) {
      throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    const rows = [];
    for (let index = 1; index < lines.length; index += 1) {
      const values = parseCsvLine(lines[index]);
      const rowValues = {};

      headers.forEach((header, valueIndex) => {
        rowValues[header] = (values[valueIndex] || '').trim();
      });

      const rowNumber = index + 1;
      const cardHolderId = rowValues.CardHolderID;
      const amountReceived = parseMoney(rowValues.AmountReceived, Number.NaN);
      const dateReceived = rowValues.DateReceived || todayIso();
      const programFee = parseMoney(rowValues.ProgramFee, 0);
      const setupFee = parseMoney(rowValues.SetupFee, 0);
      const wireFee = parseMoney(rowValues.WireFee, 10);
      const senderName = rowValues.SenderName || '';
      const reference = rowValues.Reference || '';
      const netAmount = Number.parseFloat((amountReceived - (programFee + setupFee)).toFixed(2));

      if (!cardHolderId) {
        throw new Error(`Row ${rowNumber}: CardHolderID is required.`);
      }
      if (!Number.isFinite(amountReceived) || amountReceived <= 0) {
        throw new Error(`Row ${rowNumber}: AmountReceived must be a number greater than 0.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReceived)) {
        throw new Error(`Row ${rowNumber}: DateReceived must be in YYYY-MM-DD format.`);
      }
      if (netAmount <= 0) {
        throw new Error(`Row ${rowNumber}: Net amount must be greater than 0.`);
      }

      rows.push({
        rowNumber,
        cardHolderId,
        amountReceived,
        dateReceived,
        programFee,
        setupFee,
        wireFee,
        senderName,
        reference,
        netAmount
      });
    }

    if (!rows.length) {
      throw new Error('No data rows found in CSV.');
    }

    return rows;
  };

  const handleBulkUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBulkFileName(file.name);
    setBulkMessage(null);
    setBulkResults([]);

    try {
      const fileText = await file.text();
      const parsedRows = parseBulkRows(fileText);
      setBulkRows(parsedRows);
      setBulkMessage({
        type: 'success',
        text: `Loaded ${parsedRows.length} wire rows from ${file.name}.`
      });
    } catch (error) {
      setBulkRows([]);
      setBulkMessage({
        type: 'error',
        text: error.message || 'Invalid CSV file.'
      });
    } finally {
      event.target.value = '';
    }
  };

  const handleProcessBulkWires = async () => {
    if (!bulkRows.length) {
      setBulkMessage({ type: 'error', text: 'Upload a CSV file before processing.' });
      return;
    }

    setBulkProcessing(true);
    setBulkMessage(null);

    const runResults = [];
    for (const row of bulkRows) {
      try {
        const outcome = await processWireForCardholder({
          cardHolderId: row.cardHolderId,
          amountReceived: row.amountReceived,
          dateReceived: row.dateReceived,
          programFee: row.programFee,
          setupFee: row.setupFee,
          wireFee: row.wireFee,
          senderName: row.senderName,
          reference: row.reference
        });

        runResults.push({
          ...row,
          success: outcome.success,
          netAmount: outcome.netAmount,
          vendorFeeId: outcome.vendorFee?.FeeID || '',
          wireFeeId: outcome.wireFeeResult?.FeeID || '',
          adjustmentFeeId: outcome.adjustment?.FeeID || '',
          errorMessage: outcome.errorMessage
        });
      } catch (error) {
        runResults.push({
          ...row,
          success: false,
          vendorFeeId: '',
          wireFeeId: '',
          adjustmentFeeId: '',
          errorMessage: error.message || 'Network error processing wire'
        });
      }
    }

    setBulkResults(runResults);
    const successCount = runResults.filter((result) => result.success).length;
    const failedCount = runResults.length - successCount;

    setBulkMessage({
      type: failedCount === 0 ? 'success' : 'warning',
      text: failedCount === 0
        ? `Processed ${successCount} of ${runResults.length} rows successfully.`
        : `Processed ${successCount} of ${runResults.length} rows successfully. ${failedCount} failed.`
    });
    setBulkProcessing(false);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>Wire Payment Processing</Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {message && (
        <Alert severity={message.type} sx={{ mb: 3 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Grid container spacing={4}>
        {/* Main Form Area */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 4 }}>
            {/* Step 0: Select Client */}
            {activeStep === 0 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FileText size={20} /> Step 1: Client Verification
                </Typography>
                <Autocomplete
                  options={cardholders}
                  value={selectedCardholder}
                  onChange={(e, newValue) => setSelectedCardholder(newValue)}
                  renderInput={(params) => (
                    <TextField {...params} label="Search Client by Name or ID" fullWidth />
                  )}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                />
                {selectedCardholder && (
                  <Card sx={{ mt: 3, bgcolor: '#f5f5f5' }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="textSecondary">Selected Client</Typography>
                      <Typography variant="h6">{selectedCardholder.name}</Typography>
                      <Typography variant="body2">ID: {selectedCardholder.id}</Typography>
                      <Typography variant="body2">
                        Current Balance: <strong>${selectedCardholder.balance}</strong>
                      </Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}

            {/* Step 1: Wire Details */}
            {activeStep === 1 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DollarSign size={20} /> Step 2: Wire Receipt Details
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Amount Received"
                      type="number"
                      value={wireForm.amountReceived}
                      onChange={(e) => setWireForm({ ...wireForm, amountReceived: e.target.value })}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Date Received"
                      type="date"
                      value={wireForm.dateReceived}
                      onChange={(e) => setWireForm({ ...wireForm, dateReceived: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Sender Name (Optional)"
                      value={wireForm.senderName}
                      onChange={(e) => setWireForm({ ...wireForm, senderName: e.target.value })}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Bank Reference (Optional)"
                      value={wireForm.reference}
                      onChange={(e) => setWireForm({ ...wireForm, reference: e.target.value })}
                    />
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* Step 2: Fee Calculation */}
            {activeStep === 2 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AlertCircle size={20} /> Step 3: Fee Calculation
                </Typography>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Program Fee"
                      type="number"
                      value={fees.programFee}
                      onChange={(e) => setFees({ ...fees, programFee: e.target.value })}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      helperText="Fee retained by program"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Setup Fee"
                      type="number"
                      value={fees.setupFee}
                      onChange={(e) => setFees({ ...fees, setupFee: e.target.value })}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      helperText="One-time setup fee (if applicable)"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Wire Processing Fee"
                      type="number"
                      value={fees.wireFee}
                      onChange={(e) => setFees({ ...fees, wireFee: e.target.value })}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      helperText="Creates separate fee entry"
                    />
                  </Grid>
                </Grid>

                <Divider sx={{ my: 3 }} />

                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell>Wire Amount Received</TableCell>
                        <TableCell align="right">${parseFloat(wireForm.amountReceived || 0).toFixed(2)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Less: Program Fee</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>
                          -${parseFloat(fees.programFee || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Less: Setup Fee</TableCell>
                        <TableCell align="right" sx={{ color: 'error.main' }}>
                          -${parseFloat(fees.setupFee || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Net Amount (Account Adjustment)</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                          ${calculateNetAmount()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Step 3: Confirm & Process */}
            {activeStep === 3 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Send size={20} /> Step 4: Review & Generate
                </Typography>

                <Card sx={{ mb: 3, border: '1px solid #1976d2' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="primary" gutterBottom>
                      Wire Receipt Summary
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="textSecondary">Client</Typography>
                        <Typography variant="body2">{selectedCardholder?.name}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="textSecondary">Client ID</Typography>
                        <Typography variant="body2">{selectedCardholder?.id}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="textSecondary">Wire Amount Received</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          ${parseFloat(wireForm.amountReceived || 0).toFixed(2)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="caption" color="textSecondary">Net to Account</Typography>
                        <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                          ${calculateNetAmount()}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                {(parseFloat(getTotalFees()) > 0) && (
                  <Card sx={{ mb: 3, border: '1px solid #4caf50' }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="success.main" gutterBottom>
                        VendorFee to be Created (Program/Setup Fees)
                      </Typography>
                      <Typography variant="body2">
                        Amount: <strong>${getTotalFees()}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Description: Wire {wireForm.dateReceived.replace(/-/g, '/')} - Fees
                      </Typography>
                      <Typography variant="caption" display="block">Type: Account Adjustment</Typography>
                    </CardContent>
                  </Card>
                )}

                {fees.wireFee && parseFloat(fees.wireFee) > 0 && (
                  <Card sx={{ mb: 3, border: '1px solid #ff9800' }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="warning.main" gutterBottom>
                        VendorFee to be Created (Wire Processing)
                      </Typography>
                      <Typography variant="body2">
                        Amount: <strong>${parseFloat(fees.wireFee).toFixed(2)}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Description: Wire Received Fee
                      </Typography>
                      <Typography variant="caption" display="block">Type: Account Adjustment</Typography>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}

            {/* Step 4: Completed */}
            {activeStep === 4 && (
              <Box sx={{ py: 4 }}>
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                  <CheckCircle size={64} color="#4caf50" />
                  <Typography variant="h5" sx={{ mt: 2, color: 'success.main' }}>
                    Processing Complete!
                  </Typography>
                </Box>

                {results.adjustment && (
                  <Card sx={{ mb: 2, borderLeft: '6px solid #4caf50' }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="success.main">Account Credit (Deposit) Created</Typography>
                      <Typography variant="h6">
                        +${calculateNetAmount()}
                      </Typography>
                      <Typography variant="body2">
                        Transaction ID: <strong>{results.adjustment.FeeID || 'Created'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Status: <Chip label="Transmitted" size="small" color="success" sx={{ ml: 1 }} />
                      </Typography>
                    </CardContent>
                  </Card>
                )}

                {results.vendorFee && (
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="textSecondary">Program/Setup Fee</Typography>
                      <Typography variant="body2">
                        Fee ID: <strong>{results.vendorFee.FeeID || 'Created'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Amount: <strong>${getTotalFees()}</strong>
                      </Typography>
                    </CardContent>
                  </Card>
                )}

                {results.wireFeeResult && (
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="success.main">Program/Setup Fee Created</Typography>
                      <Typography variant="body2">
                        Fee ID: <strong>{results.vendorFee.FeeID || 'Created'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Amount: <strong>${getTotalFees()}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Status: <Chip label="Pending" size="small" color="primary" sx={{ ml: 1 }} />
                      </Typography>
                    </CardContent>
                  </Card>
                )}

                {results.wireFeeResult && (
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="warning.main">Wire Processing Fee Created</Typography>
                      <Typography variant="body2">
                        Fee ID: <strong>{results.wireFeeResult.FeeID || 'Created'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Amount: <strong>${fees.wireFee}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Status: <Chip label="Pending" size="small" color="primary" sx={{ ml: 1 }} />
                      </Typography>
                    </CardContent>
                  </Card>
                )}

                <Box sx={{ textAlign: 'center', mt: 4 }}>
                  <Button variant="contained" onClick={handleReset}>
                    Process Another Wire
                  </Button>
                </Box>
              </Box>
            )}

            {/* Navigation Buttons */}
            {activeStep < 4 && (
              <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
                <Button
                  disabled={activeStep === 0}
                  onClick={handleBack}
                >
                  Back
                </Button>
                {activeStep === 3 ? (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleProcessWire}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Process Wire Payment'}
                  </Button>
                ) : (
                  <Button variant="contained" onClick={handleNext}>
                    Next
                  </Button>
                )}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Summary Sidebar */}
        <Grid item xs={12} md={4}>
          <Card sx={{ position: 'sticky', top: 100 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Summary</Typography>
              <Divider sx={{ mb: 2 }} />

              {selectedCardholder ? (
                <>
                  <Typography variant="caption" color="textSecondary">Client</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>{selectedCardholder.name}</Typography>
                </>
              ) : (
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  No client selected
                </Typography>
              )}

              {wireForm.amountReceived && (
                <>
                  <Typography variant="caption" color="textSecondary">Wire Received</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    ${parseFloat(wireForm.amountReceived).toFixed(2)}
                  </Typography>
                </>
              )}

              {(fees.programFee || fees.setupFee) && (
                <>
                  <Typography variant="caption" color="textSecondary">Total Fees</Typography>
                  <Typography variant="body2" sx={{ mb: 2, color: 'error.main' }}>
                    -${getTotalFees()}
                  </Typography>
                </>
              )}

              {wireForm.amountReceived && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="textSecondary">Net to Account</Typography>
                  <Typography variant="h5" sx={{ color: 'success.main' }}>
                    ${calculateNetAmount()}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 4, mt: 4 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Upload size={20} /> Bulk Wire Upload (CSV)
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Upload one CSV file to process multiple account wires in a single run. Each row creates the same entries as manual processing: program/setup fee, wire fee, and net account adjustment.
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Button
            variant="outlined"
            component="a"
            href={BULK_SAMPLE_PATH}
            download
          >
            Download Sandbox Test CSV
          </Button>
          <Button variant="contained" component="label">
            Upload CSV
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={handleBulkUpload}
            />
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleProcessBulkWires}
            disabled={bulkProcessing || bulkRows.length === 0}
          >
            {bulkProcessing ? 'Processing Bulk Upload...' : 'Process Bulk Upload'}
          </Button>
        </Box>

        <Typography variant="caption" color="textSecondary" display="block" sx={{ mb: 1 }}>
          Required CSV headers:
        </Typography>
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fafafa' }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {CSV_HEADERS.join(',')}
          </Typography>
        </Paper>

        {bulkFileName && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            Loaded file: <strong>{bulkFileName}</strong>
          </Typography>
        )}

        {bulkMessage && (
          <Alert severity={bulkMessage.type} sx={{ mb: 2 }} onClose={() => setBulkMessage(null)}>
            {bulkMessage.text}
          </Alert>
        )}

        {bulkRows.length > 0 && (
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxHeight: 340 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Row</TableCell>
                  <TableCell>CardHolderID</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Program Fee</TableCell>
                  <TableCell align="right">Setup Fee</TableCell>
                  <TableCell align="right">Wire Fee</TableCell>
                  <TableCell align="right">Net</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bulkRows.map((row) => (
                  <TableRow key={`${row.rowNumber}-${row.cardHolderId}`}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.cardHolderId}</TableCell>
                    <TableCell>{row.dateReceived}</TableCell>
                    <TableCell align="right">${row.amountReceived.toFixed(2)}</TableCell>
                    <TableCell align="right">${row.programFee.toFixed(2)}</TableCell>
                    <TableCell align="right">${row.setupFee.toFixed(2)}</TableCell>
                    <TableCell align="right">${row.wireFee.toFixed(2)}</TableCell>
                    <TableCell align="right">${row.netAmount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {bulkResults.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <ListChecks size={18} /> Bulk Processing Results
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Row</TableCell>
                    <TableCell>CardHolderID</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Vendor Fee ID</TableCell>
                    <TableCell>Wire Fee ID</TableCell>
                    <TableCell>Adjustment ID</TableCell>
                    <TableCell>Message</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bulkResults.map((result) => (
                    <TableRow key={`result-${result.rowNumber}-${result.cardHolderId}`}>
                      <TableCell>{result.rowNumber}</TableCell>
                      <TableCell>{result.cardHolderId}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={result.success ? 'success' : 'error'}
                          label={result.success ? 'Success' : 'Failed'}
                        />
                      </TableCell>
                      <TableCell>{result.vendorFeeId || '-'}</TableCell>
                      <TableCell>{result.wireFeeId || '-'}</TableCell>
                      <TableCell>{result.adjustmentFeeId || '-'}</TableCell>
                      <TableCell>{result.errorMessage || 'Processed successfully'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default WirePaymentProcessing;
