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
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Alert,
  IconButton,
  Collapse,
  Tabs,
  Tab,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Snackbar
} from '@mui/material';
import { Users, ChevronDown, ChevronUp, Info, FileText, Download, Copy, Check } from 'lucide-react';
import { CARDHOLDER_STATUSES, getStatusConfig } from '../constants/statusConfig';
import { toArray, safeDate, formatDate, parseCurrency, formatStatementMoney, csvEscape, normalizeFields } from '../utils/csvHelpers';
import { buildStatementTransactions, generateStatementCSV, EFT_STATEMENT_FIELDS, FEE_STATEMENT_FIELDS } from '../utils/statementBuilder';

const formatDateTime = (value) => {
  const parsed = safeDate(value);
  return parsed ? parsed.toLocaleString() : value || '-';
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(2)}` : `$${value}`;
};

const SoapApiReference = ({ method, params }) => {
  const [copied, setCopied] = useState(false);
  const endpoint = 'https://www.securpaycardportal.com/proxy/proxy.incoming/eftservice.asmx';
  const soapAction = `"http://tempuri.org/${method}"`;
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${method} xmlns="http://tempuri.org/">
      <UserName>DCG_API</UserName>
      <PassWord>••••••••</PassWord>
${params.map(([k, v]) => `      <${k}>${v}</${k}>`).join('\n')}
    </${method}>
  </soap:Body>
</soap:Envelope>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ mt: 1, mb: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, mb: 0.5 }}>
        <Typography variant="caption"><strong>Endpoint:</strong> {endpoint}</Typography>
        <Typography variant="caption"><strong>SOAPAction:</strong> {soapAction}</Typography>
      </Box>
      <Box sx={{ position: 'relative' }}>
        <Box component="pre" sx={{
          bgcolor: '#1e1e1e', color: '#d4d4d4', p: 2, borderRadius: 1,
          fontSize: '0.72rem', fontFamily: 'monospace', overflowX: 'auto', m: 0
        }}>
          {body}
        </Box>
        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{ position: 'absolute', top: 4, right: 4, color: '#aaa' }}
          title="Copy SOAP envelope"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </IconButton>
      </Box>
    </Box>
  );
};

// Helper component for inner transaction rows
const TransactionRow = ({ item, type }) => {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const handleExpand = async () => {
    setExpanded(!expanded);
    if (!expanded && !historyLoaded && type === 'EFT') {
      setLoadingHistory(true);
      try {
        const response = await fetch('/api/eft/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ EftTransactionID: item.EftTransactionID })
        });
        const data = await response.json();
        if (data.EftChangeList && data.EftChangeList.EFTChangeLogDetail) {
          setHistory(Array.isArray(data.EftChangeList.EFTChangeLogDetail) 
            ? data.EftChangeList.EFTChangeLogDetail 
            : [data.EftChangeList.EFTChangeLogDetail]);
        }
        setHistoryLoaded(true);
      } catch (err) {
        console.error("Audit load failed", err);
      } finally {
        setLoadingHistory(false);
      }
    }
  };

  const Field = ({ label, value }) => (
    <Grid item size={{ xs: 12, sm: 4 }}>
      <Typography variant="caption" color="textSecondary" display="block" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Box sx={{ p: 1, border: '1px solid #e0e0e0', borderRadius: 1, mt: 0.5, bgcolor: '#fafafa', minHeight: '34px' }}>
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value || '-'}</Typography>
      </Box>
    </Grid>
  );

  return (
    <>
      <TableRow 
        hover 
        onClick={handleExpand} 
        sx={{ cursor: 'pointer', '& > *': { borderBottom: 'unset' }, bgcolor: expanded ? '#f0f7ff' : 'inherit' }}
      >
        <TableCell>
          <IconButton size="small">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
        </TableCell>
        {type === 'EFT' ? (
          <>
            <TableCell>{item.EftTransactionID}</TableCell>
            <TableCell>{new Date(item.EftDate).toLocaleDateString()}</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>${item.EftAmount}</TableCell>
            <TableCell>
              <Chip label={item.StatusCode} size="small" color={item.StatusCode === 'Settled' ? 'success' : 'primary'} />
            </TableCell>
            <TableCell>
              <Typography variant="caption" display="block">{item.BankName}</Typography>
              <Typography variant="caption" color="textSecondary">
                ****{item.AccountNumber ? item.AccountNumber.slice(-4) : '****'}
              </Typography>
            </TableCell>
            <TableCell>{item.Memo || '-'}</TableCell>
          </>
        ) : (
          <>
            <TableCell>{item.FeeID}</TableCell>
            <TableCell>{new Date(item.Fee_Date).toLocaleDateString()}</TableCell>
            <TableCell>{item.FeeType}</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>${item.FeeAmount}</TableCell>
            <TableCell>
              <Chip label={item.StatusCode} size="small" color={item.StatusCode === 'Transmitted' ? 'success' : 'warning'} />
            </TableCell>
            <TableCell>
              {item.FeeType === 'SettlementPayment' ? item.PaidToName : 'Program Fee'}
            </TableCell>
          </>
        )}
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ m: 2, p: 3, bgcolor: '#fff', border: '1px solid #1a73e8', borderRadius: 2 }}>
              <Typography variant="subtitle1" color="primary" sx={{ mb: 3, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Info size={20} /> Transaction Data Entry (Read-Only)
              </Typography>
              
              <Grid container spacing={2}>
                {type === 'EFT' ? (
                  <>
                    <Field label="EFT Date" value={new Date(item.EftDate).toLocaleDateString()} />
                    <Field label="EFT Amount" value={`$${item.EftAmount}`} />
                    <Field label="Description / Memo" value={item.Memo} />
                    <Field label="Bank Name" value={item.BankName} />
                    <Field label="Account Number" value={item.AccountNumber} />
                    <Field label="Routing Number" value={item.RoutingNumber} />
                    <Field label="Status" value={item.StatusCode} />
                    <Field label="Created Date" value={new Date(item.CreatedDate).toLocaleString()} />
                    <Field label="Settled Date" value={item.SettledDate} />
                    <Field label="Returned Date" value={item.ReturnedDate} />
                    <Field label="Return Code" value={item.NSFReturnCode} />
                    <Field label="Last Message" value={item.LastMessage} />
                  </>
                ) : (
                  <>
                    <Field label="Fee Date" value={new Date(item.Fee_Date).toLocaleDateString()} />
                    <Field label="Fee Amount" value={`$${item.FeeAmount}`} />
                    <Field label="Fee Description/Memo" value={item.Description} />
                    
                    <Field label="PaidTo Name" value={item.PaidToName} />
                    <Field label="PaidTo Contact Name" value={item.PaidToContactName} />
                    <Field label="PaidTo Cust Number" value={item.PaidToCustomerNumber} />
                    
                    <Field label="PaidTo Phone" value={item.PaidToPhone} />
                    <Field label="PaidTo Street" value={item.PaidToStreet} />
                    <Field label="PaidTo Street 2" value={item.PaidToStreet2} />
                    
                    <Field label="PaidTo City" value={item.PaidToCity} />
                    <Field label="PaidTo State" value={item.PaidToState} />
                    <Field label="PaidTo Zip" value={item.PaidToZip} />
                    
                    <Field label="Bank Reference ID" value={item.BankReferenceID} />
                    <Field label="Fee Status" value={item.StatusCode} />
                    <Field label="Settlement ID" value={item.EftTransactionID} />

                    <Field label="Account Number" value={item.AccountNumber} />
                    <Field label="Routing Number" value={item.RoutingNumber} />
                    <Field label="Instructions" value={item.Party} />
                  </>
                )}
              </Grid>

              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" sx={{ mb: 1, fontSize: '1rem', fontWeight: 'bold' }}>
                  API Reference — How to Fetch This Record
                </Typography>
                {type === 'EFT' ? (
                  <>
                    <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary' }}>FindEftByEFTTransactionID</Typography>
                    <SoapApiReference method="FindEftByEFTTransactionID" params={[['EFTTRansactionID', item.EftTransactionID]]} />
                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, color: 'text.secondary' }}>FindEftChangeByID (Audit Trail)</Typography>
                    <SoapApiReference method="FindEftChangeByID" params={[['EFTTRansactionID', item.EftTransactionID]]} />
                  </>
                ) : (
                  <>
                    <Typography variant="subtitle2" sx={{ mb: 0.5, color: 'text.secondary' }}>FindFeeByID</Typography>
                    <SoapApiReference method="FindFeeByID" params={[['FeeID', item.FeeID]]} />
                  </>
                )}
              </Box>

              {type === 'EFT' && (
                <Box sx={{ mt: 5 }}>
                  <Typography variant="h6" sx={{ mb: 2, fontSize: '1rem', fontWeight: 'bold' }}>Audit Trail / History</Typography>
                  {loadingHistory ? (
                    <Typography variant="caption">Loading change log...</Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f8f9fa' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>Date Changed</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {history.length === 0 ? (
                            <TableRow><TableCell colSpan={6} align="center">No history recorded for this transaction.</TableCell></TableRow>
                          ) : history.map((log, k) => (
                            <TableRow key={k}>
                              <TableCell>{new Date(log.LogDate).toLocaleString()}</TableCell>
                              <TableCell>{log.LogUser}</TableCell>
                              <TableCell><Chip label={log.StatusCode} size="small" variant="outlined" /></TableCell>
                              <TableCell>{new Date(log.EftDate).toLocaleDateString()}</TableCell>
                              <TableCell>${log.EftAmount}</TableCell>
                              <TableCell>{log.Memo || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const StatementTransactionRow = ({ transaction }) => {
  const [expanded, setExpanded] = useState(false);

  const toLabel = (field) => field
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  const renderFieldValue = (field, value) => {
    if (field.includes('Amount')) return formatMoney(value);
    if (field.includes('Date')) return formatDateTime(value);
    return value || '-';
  };

  if (transaction.type === 'MonthBoundary') {
    return (
      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
        <TableCell />
        <TableCell colSpan={3}>
          <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            {transaction.label}
          </Typography>
        </TableCell>
        <TableCell colSpan={5} />
        <TableCell>
          <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
            {formatStatementMoney(transaction.accountBalance)}
          </Typography>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow
        hover
        onClick={() => setExpanded(!expanded)}
        sx={{ cursor: 'pointer', '& > *': { borderBottom: 'unset' } }}
      >
        <TableCell>
          <IconButton size="small">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
        </TableCell>
        <TableCell>{formatDate(transaction.date)}</TableCell>
        <TableCell>{transaction.amountLabel}</TableCell>
        <TableCell>{transaction.description || '-'}</TableCell>
        <TableCell sx={{ fontWeight: 600 }}>{formatStatementMoney(transaction.credit)}</TableCell>
        <TableCell sx={{ fontWeight: 600 }}>{formatStatementMoney(-transaction.debit)}</TableCell>
        <TableCell>{transaction.status || '-'}</TableCell>
        <TableCell>{formatDateTime(transaction.statusDate)}</TableCell>
        <TableCell>{transaction.feeId || '-'}</TableCell>
        <TableCell>{transaction.eftTransactionId || '-'}</TableCell>
        <TableCell>
          {formatStatementMoney(transaction.accountBalance)}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={11}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ m: 2, p: 2, bgcolor: '#fff', borderRadius: 2, border: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                {transaction.type} Transaction Fields (WSDL)
              </Typography>
              <Typography variant="caption" color="textSecondary" sx={{ mb: 2, display: 'block' }}>
                Transaction ID: {transaction.id || '-'} | Status: {transaction.status || '-'}
              </Typography>
              <Grid container spacing={2}>
                {transaction.fieldOrder.map((field) => (
                  <Grid item size={{ xs: 12, sm: 6, md: 4 }} key={`${transaction.type}-${transaction.id}-${field}`}>
                    <Typography variant="caption" color="textSecondary" display="block" sx={{ fontWeight: 600 }}>
                      {toLabel(field)}
                    </Typography>
                    <Box sx={{ p: 1, border: '1px solid #e0e0e0', borderRadius: 1, mt: 0.5, bgcolor: '#fafafa', minHeight: '34px' }}>
                      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                        {renderFieldValue(field, transaction.fields[field])}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  API Reference — How to Fetch This Record
                </Typography>
                {transaction.type === 'EFT' ? (
                  <>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>FindEftByEFTTransactionID</Typography>
                    <SoapApiReference method="FindEftByEFTTransactionID" params={[['EFTTRansactionID', transaction.eftTransactionId]]} />
                  </>
                ) : (
                  <>
                    <Typography variant="caption" color="textSecondary" sx={{ mb: 0.5, display: 'block' }}>FindFeeByID</Typography>
                    <SoapApiReference method="FindFeeByID" params={[['FeeID', transaction.feeId]]} />
                  </>
                )}
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const Row = ({ row, isExpanded, onExpand, onSnackbar }) => {
  const [efts, setEfts] = useState([]);
  const [fees, setFees] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  // Statement dialog state
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');
  const [statementRows, setStatementRows] = useState([]);
  const [statementLoaded, setStatementLoaded] = useState(false);

  const loadStatements = async (forceRefresh = false) => {
    if (statementLoaded && !forceRefresh) return;

    setStatementLoading(true);
    setStatementError('');

    try {
      const [eftRes, feeRes] = await Promise.all([
        fetch('/api/cardholders/efts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardholderId: row.id })
        }),
        fetch('/api/cardholders/fees-detailed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardholderId: row.id })
        })
      ]);

      const [eftData, feeData] = await Promise.all([eftRes.json(), feeRes.json()]);
      // DEBUG: log raw fee fields so we can inspect what dates the SOAP API actually returns
      const rawFees = toArray(feeData.FeeList, 'Fee2');
      if (rawFees.length > 0) {
        console.log('[Fee Debug] Raw fee sample (first 3):', JSON.stringify(rawFees.slice(0, 3), null, 2));
      }
      const eftList = toArray(eftData.EFTList, 'EFTTransactionDetail');
      const feeList = rawFees;
      setStatementRows(buildStatementTransactions(eftList, feeList, parseCurrency(row.balance)));
      setStatementLoaded(true);
    } catch (err) {
      console.error('Statement load failed:', err);
      setStatementError('Failed to load statement transactions.');
      onSnackbar?.('Failed to load statement transactions.', 'error');
    } finally {
      setStatementLoading(false);
    }
  };

  const handleOpenStatements = async () => {
    setStatementDialogOpen(true);
    await loadStatements(false);
  };

  const handleExportStatements = () => {
    if (statementRows.length === 0) return;

    const csvContent = generateStatementCSV(statementRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const downloadLink = document.createElement('a');
    const fileName = `statement-${row.id}.csv`;
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(downloadLink.href);
  };

  const handleExpandClick = async () => {
    onExpand(row.id);
    if (!isExpanded && !dataLoaded) {
      setLoadingHistory(true);
      try {
        const [eftRes, feeRes] = await Promise.all([
          fetch('/api/cardholders/efts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardholderId: row.id })
          }),
          fetch('/api/cardholders/fees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardholderId: row.id })
          })
        ]);

        const eftData = await eftRes.json();
        const feeData = await feeRes.json();

        if (eftData.EFTList && eftData.EFTList.EFTTransactionDetail) {
          setEfts(Array.isArray(eftData.EFTList.EFTTransactionDetail) 
            ? eftData.EFTList.EFTTransactionDetail 
            : [eftData.EFTList.EFTTransactionDetail]);
        }

        if (feeData.FeeList && feeData.FeeList.Fee) {
          setFees(Array.isArray(feeData.FeeList.Fee) 
            ? feeData.FeeList.Fee 
            : [feeData.FeeList.Fee]);
        }
        setDataLoaded(true);
      } catch (err) {
        console.error("Failed to load history", err);
      } finally {
        setLoadingHistory(false);
      }
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton size="small" onClick={handleExpandClick}>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </IconButton>
        </TableCell>
        <TableCell>{row.id}</TableCell>
        <TableCell sx={{ fontWeight: 500 }}>{row.name}</TableCell>
        <TableCell>{row.email}</TableCell>
        <TableCell>
          <Chip
            label={row.status}
            size="small"
            sx={{ fontWeight: 600, bgcolor: getStatusConfig(CARDHOLDER_STATUSES, row.status).color, color: '#fff' }}
          />
        </TableCell>
        <TableCell>{row.phone}</TableCell>
        <TableCell>{row.accountBalance || row.balance}</TableCell>
        <TableCell>{row.createDate ? new Date(row.createDate).toLocaleDateString() : 'N/A'}</TableCell>
        <TableCell align="right">
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<FileText size={14} />}
            onClick={(e) => { e.stopPropagation(); handleOpenStatements(); }}
            sx={{ textTransform: 'none', fontSize: '0.75rem', mr: 1 }}
          >
            Statements
          </Button>
        </TableCell>
      </TableRow>



      {/* Statement Dialog */}
      <Dialog open={statementDialogOpen} onClose={() => setStatementDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FileText size={20} />
          Statements for {row.name} ({row.id})
        </DialogTitle>
        <DialogContent>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="textSecondary">Account Balance</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{row.accountBalance || row.balance}</Typography>
              </Grid>
              <Grid item size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="textSecondary">Outstanding EPPS Fees</Typography>
                <Typography variant="body1">{formatMoney(row.raw?.OutstandingEPPSFeeAmount || 0)}</Typography>
              </Grid>
              <Grid item size={{ xs: 12, sm: 4 }}>
                <Typography variant="caption" color="textSecondary">Monthly EPPS Fee</Typography>
                <Typography variant="body1">{formatMoney(row.raw?.MonthlyEPPSFeeAmount || 0)}</Typography>
              </Grid>
            </Grid>
          </Paper>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              color="error"
              startIcon={<Download size={14} />}
              onClick={handleExportStatements}
              disabled={statementRows.length === 0}
              sx={{ textTransform: 'none' }}
            >
              Export
            </Button>
          </Box>

          {statementError && <Alert severity="error" sx={{ mb: 2 }}>{statementError}</Alert>}

          {statementLoading ? (
            <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
              Loading transactions...
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8f9fa' }}>
                    <TableCell width={40} />
                    <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Credit</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Debit</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status Code</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Fee ID</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Eft Transaction ID</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Account Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {statementRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} align="center" sx={{ py: 3 }}>
                        No statement transactions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    statementRows.map((transaction, index) => (
                      <StatementTransactionRow
                        key={`${transaction.type}-${transaction.id || index}-${index}`}
                        transaction={transaction}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => loadStatements(true)} disabled={statementLoading}>
            Refresh
          </Button>
          <Button variant="contained" onClick={() => setStatementDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={9}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
              <Typography variant="h6" gutterBottom component="div">
                Cardholder Profile
              </Typography>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">First Name</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{row.firstName}</Typography>
                </Grid>
                <Grid item size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Last Name</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{row.lastName}</Typography>
                </Grid>
                <Grid item size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Account Status</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={row.status}
                      size="small"
                      sx={{ fontWeight: 600, bgcolor: getStatusConfig(CARDHOLDER_STATUSES, row.status).color, color: '#fff' }}
                    />
                  </Box>
                </Grid>
                <Grid item size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Address</Typography>
                  <Typography variant="body2">{row.address || 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="textSecondary">City</Typography>
                  <Typography variant="body2">{row.city || 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 2 }}>
                  <Typography variant="caption" color="textSecondary">State</Typography>
                  <Typography variant="body2">{row.state || 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="textSecondary">Zip</Typography>
                  <Typography variant="body2">{row.zip || 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Phone</Typography>
                  <Typography variant="body2">{row.phone}</Typography>
                </Grid>
                <Grid item size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Email</Typography>
                  <Typography variant="body2">{row.email}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Status Date</Typography>
                  <Typography variant="body2">{row.statusDate ? new Date(row.statusDate).toLocaleDateString() : 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Created Date</Typography>
                  <Typography variant="body2">{row.createDate ? new Date(row.createDate).toLocaleDateString() : 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Account Balance</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{row.accountBalance || row.balance}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 4 }}>
                  <Typography variant="caption" color="textSecondary">Outstanding Fees</Typography>
                  <Typography variant="body2" color="error">${row.raw?.OutstandingEPPSFeeAmount || '0.00'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="textSecondary">Monthly Fee</Typography>
                  <Typography variant="body2">${row.raw?.MonthlyEPPSFeeAmount || '0.00'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="textSecondary">Next Fee Date</Typography>
                  <Typography variant="body2">{row.raw?.NextEPPSFeeDate ? new Date(row.raw.NextEPPSFeeDate).toLocaleDateString() : 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="textSecondary">DOB</Typography>
                  <Typography variant="body2">{row.raw?.DateOfBirth ? new Date(row.raw.DateOfBirth).toLocaleDateString() : 'N/A'}</Typography>
                </Grid>
                <Grid item size={{ xs: 6, sm: 3 }}>
                  <Typography variant="caption" color="textSecondary">SSN</Typography>
                  <Typography variant="body2">{row.raw?.SSN || '***-**-****'}</Typography>
                </Grid>
                <Grid item size={{ xs: 12 }}>
                  <Typography variant="caption" color="textSecondary">Last System Message</Typography>
                  <Typography variant="body2" sx={{ fontStyle: 'italic', color: '#666' }}>{row.raw?.LastMessage || 'None'}</Typography>
                </Grid>
              </Grid>

              {/* Tabs for History */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tabValue} onChange={handleTabChange} aria-label="history tabs">
                  <Tab label={`Debits / EFTs (${efts.length})`} />
                  <Tab label={`Fees & Settlements (${fees.length})`} />
                </Tabs>
              </Box>

              {loadingHistory ? (
                <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
                  Loading comprehensive history from sandbox...
                </Typography>
              ) : (
                <>
                  {/* EFT Tab Content */}
                  <div role="tabpanel" hidden={tabValue !== 0}>
                    {tabValue === 0 && (
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: '#eeeeee' }}>
                              <TableCell width={40} />
                              <TableCell sx={{ fontWeight: 'bold' }}>ID</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Bank Info</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Memo</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {efts.length === 0 ? (
                              <TableRow><TableCell colSpan={7} align="center">No debits found.</TableCell></TableRow>
                            ) : efts.map((eft, i) => (
                              <TransactionRow key={i} item={eft} type="EFT" />
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </div>

                  {/* Fees Tab Content */}
                  <div role="tabpanel" hidden={tabValue !== 1}>
                    {tabValue === 1 && (
                      <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: '#eeeeee' }}>
                              <TableCell width={40} />
                              <TableCell sx={{ fontWeight: 'bold' }}>ID</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Payee</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {fees.length === 0 ? (
                              <TableRow><TableCell colSpan={8} align="center">No fees found.</TableCell></TableRow>
                            ) : fees.map((fee, i) => (
                              <TransactionRow key={i} item={fee} type="Fee" />
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </div>
                </>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const Cardholders = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cardholders, setCardholders] = useState([]);
  const [filteredCardholders, setFilteredCardholders] = useState([]);

  // Snackbar state
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const handleSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Filter State
  const [filters, setFilters] = useState({
    id: '',
    name: '',
    email: '',
    status: 'All'
  });

  // Manage expanded rows (limit to 3)
  const [expandedIds, setExpandedIds] = useState([]);

  // Fetch all accounts automatically on mount
  React.useEffect(() => {
    fetchAccounts();
  }, []);

  // Apply filters whenever filters state or cardholders list changes
  React.useEffect(() => {
    const lowerId = filters.id.toLowerCase();
    const lowerName = filters.name.toLowerCase();
    const lowerEmail = filters.email.toLowerCase();

    const result = cardholders.filter(ch => {
      const matchId = ch.id.toLowerCase().includes(lowerId);
      const matchName = ch.name.toLowerCase().includes(lowerName);
      const matchEmail = ch.email.toLowerCase().includes(lowerEmail);
      const matchStatus = filters.status === 'All' || ch.status === filters.status;

      return matchId && matchName && matchEmail && matchStatus;
    });
    setFilteredCardholders(result);
  }, [filters, cardholders]);

  const fetchAccounts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/cardholders/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const rawText = await response.text();
      let data = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          setError('Server returned a non-JSON response. Check that the API proxy is configured.');
          return;
        }
      }

      const apiError =
        data.message ||
        data.Message ||
        data.details ||
        (typeof data.error === 'string' ? data.error : null);

      if (!response.ok) {
        setError(apiError || `Request failed (${response.status}).`);
        return;
      }

      if (data.error && !data.CardHolderList) {
        setError(apiError || 'EPPS request failed.');
        return;
      }

      const list = data.CardHolderList;
      const rawDetails = list?.CardHolderDetail;
      const details = rawDetails
        ? Array.isArray(rawDetails)
          ? rawDetails
          : [rawDetails]
        : [];

      if (details.length === 0) {
        setCardholders([]);
        if (data.Message) setError(data.Message);
        return;
      }

      const newEntries = details.map((ch) => ({
        id: ch.CardHolderID,
        firstName: ch.FirstName || '',
        lastName: ch.LastName || '',
        name: `${ch.FirstName} ${ch.LastName}`,
        status: ch.Status || 'Created',
        email: ch.Email || 'N/A',
        phone: ch.Phone || ch.PhoneNumber || 'N/A',
        address: ch.Address || ch.Street || '',
        city: ch.City || '',
        state: ch.State || '',
        zip: ch.Zip || '',
        accountBalance: `$${ch.AccountBalance || '0.00'}`,
        balance: `$${ch.AccountBalance || '0.00'}`,
        statusDate: ch.StatusDate || null,
        createDate: ch.CreateDate || ch.CreatedDate || null,
        raw: ch
      }));
      setCardholders(newEntries);
    } catch (err) {
      const msg = err?.message || String(err);
      const hint =
        /fetch|network|load failed|failed to fetch/i.test(msg)
          ? ' Start the backend with `npm run server` (or `npm run dev` for app + server). It must listen on the port Vite proxies to (default 3001).'
          : '';
      setError(`Failed to fetch accounts: ${msg}.${hint}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = (id) => {
    setExpandedIds(prev => {
      const isAlreadyOpen = prev.includes(id);
      if (isAlreadyOpen) {
        return prev.filter(rowId => rowId !== id);
      } else {
        const newExpanded = [...prev, id];
        if (newExpanded.length > 3) {
          return [...newExpanded.slice(1)]; 
        }
        return newExpanded;
      }
    });
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>Cardholder Management</Typography>
        
        {/* Filter Bar */}
        <Paper sx={{ p: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item size={{ xs: 12, sm: 3 }}>
              <TextField 
                fullWidth 
                size="small" 
                label="Filter by ID" 
                value={filters.id}
                onChange={(e) => setFilters({...filters, id: e.target.value})}
              />
            </Grid>
            <Grid item size={{ xs: 12, sm: 3 }}>
              <TextField 
                fullWidth 
                size="small" 
                label="Filter by Name" 
                value={filters.name}
                onChange={(e) => setFilters({...filters, name: e.target.value})}
              />
            </Grid>
            <Grid item size={{ xs: 12, sm: 3 }}>
              <TextField 
                fullWidth 
                size="small" 
                label="Filter by Email" 
                value={filters.email}
                onChange={(e) => setFilters({...filters, email: e.target.value})}
              />
            </Grid>
            <Grid item size={{ xs: 12, sm: 3 }}>
              <TextField 
                select 
                fullWidth 
                size="small" 
                label="Status" 
                SelectProps={{ native: true }}
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
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
        </Paper>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ width: '100%', overflow: 'hidden', mb: 2 }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 250px)' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell width={50} />
                <TableCell sx={{ fontWeight: 'bold' }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Account Balance</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3 }}>Loading accounts...</TableCell>
                </TableRow>
              ) : filteredCardholders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 3 }}>No cardholders found matching filters.</TableCell>
                </TableRow>
              ) : (
                filteredCardholders.map((row) => (
                  <Row
                    key={row.id}
                    row={row}
                    isExpanded={expandedIds.includes(row.id)}
                    onExpand={handleExpand}
                    onSnackbar={handleSnackbar}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Cardholders;
