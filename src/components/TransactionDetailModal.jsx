import React, { useEffect, useState } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Grid, 
  TextField, 
  Typography,
  Divider,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';

const TransactionDetailModal = ({ open, onClose, transaction, type }) => {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (open && transaction) {
      fetchHistory();
    }
  }, [open, transaction]);

  const fetchHistory = async () => {
    // Only EFTs typically have a change log exposed via FindEftChangeByID
    // Fees might not have a direct "history" endpoint in the WSDL we saw, 
    // but we can try reusing the ID if applicable or skip for fees.
    if (type !== 'EFT') return; 

    setLoadingHistory(true);
    try {
      const response = await fetch('/api/eft/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ EftTransactionID: transaction.EftTransactionID })
      });
      const data = await response.json();
      
      if (data.EftChangeList && data.EftChangeList.EFTChangeLogDetail) {
        setHistory(Array.isArray(data.EftChangeList.EFTChangeLogDetail) 
          ? data.EftChangeList.EFTChangeLogDetail 
          : [data.EftChangeList.EFTChangeLogDetail]);
      }
    } catch (err) {
      console.error("Failed to load audit history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!transaction) return null;

  // Helper to render a read-only field
  const Field = ({ label, value }) => (
    <Grid item xs={12} sm={6} md={4}>
      <TextField
        fullWidth
        label={label}
        value={value || ''}
        variant="outlined"
        size="small"
        InputProps={{ readOnly: true }}
        InputLabelProps={{ shrink: true }}
      />
    </Grid>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1a73e8', color: 'white', mb: 2 }}>
        {type} Transaction Detail: {transaction.EftTransactionID || transaction.FeeID}
      </DialogTitle>
      
      <DialogContent>
        {/* Top Section: Form Fields */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {type === 'EFT' ? (
            <>
              <Field label="EFT Date" value={new Date(transaction.EftDate).toLocaleDateString()} />
              <Field label="Amount" value={`$${transaction.EftAmount}`} />
              <Field label="Status" value={transaction.StatusCode} />
              <Field label="Bank Name" value={transaction.BankName} />
              <Field label="Account Number" value={transaction.AccountNumber} />
              <Field label="Routing Number" value={transaction.RoutingNumber} />
              <Field label="Memo" value={transaction.Memo} />
              <Field label="Created Date" value={new Date(transaction.CreatedDate).toLocaleString()} />
              <Field label="Settled Date" value={transaction.SettledDate} />
              <Field label="Returned Date" value={transaction.ReturnedDate} />
              <Field label="Return Code" value={transaction.NSFReturnCode} />
            </>
          ) : (
            <>
              <Field label="Fee Date" value={new Date(transaction.Fee_Date).toLocaleDateString()} />
              <Field label="Fee Amount" value={`$${transaction.FeeAmount}`} />
              <Field label="Fee Status" value={transaction.StatusCode} />
              <Field label="Fee Type" value={transaction.FeeType} />
              <Field label="Description" value={transaction.Description} />
              
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }}>Paid To (Settlement) Details</Divider>
              </Grid>
              
              <Field label="Paid To Name" value={transaction.PaidToName} />
              <Field label="Paid To Contact" value={transaction.PaidToContactName} />
              <Field label="Paid To Phone" value={transaction.PaidToPhone} />
              <Field label="Paid To Street" value={transaction.PaidToStreet} />
              <Field label="Paid To Street 2" value={transaction.PaidToStreet2} />
              <Field label="Paid To City" value={transaction.PaidToCity} />
              <Field label="Paid To State" value={transaction.PaidToState} />
              <Field label="Paid To Zip" value={transaction.PaidToZip} />
              <Field label="Paid To Cust Number" value={transaction.PaidToCustomerNumber} />
              <Field label="Bank Reference ID" value={transaction.BankReferenceID} />
            </>
          )}
        </Grid>

        {/* Bottom Section: Audit History */}
        {type === 'EFT' && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Audit History / Change Log</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>Date Changed</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow><TableCell colSpan={5} align="center">Loading history...</TableCell></TableRow>
                  ) : history.length === 0 ? (
                    <TableRow><TableCell colSpan={5} align="center">No changes recorded.</TableCell></TableRow>
                  ) : history.map((log, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(log.LogDate).toLocaleString()}</TableCell>
                      <TableCell>{log.LogUser}</TableCell>
                      <TableCell>{log.StatusCode}</TableCell>
                      <TableCell>${log.EftAmount}</TableCell>
                      <TableCell>{log.Memo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TransactionDetailModal;
