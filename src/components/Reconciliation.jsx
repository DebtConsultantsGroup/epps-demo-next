import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  TextField, 
  Button, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { Search, ChevronDown, CheckCircle } from 'lucide-react';

const Reconciliation = () => {
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/deposits/find-by-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          DepositStartDate: `${dateRange.start}T00:00:00`,
          DepositEndDate: `${dateRange.end}T23:59:59`
        })
      });
      console.log("Response Status:", response.status);
      const data = await response.json();
      console.log("Response Data:", data);
      
      let list = [];
      if (data && data.deposits && data.deposits.DepositDetail) {
        const rawList = Array.isArray(data.deposits.DepositDetail) 
          ? data.deposits.DepositDetail 
          : [data.deposits.DepositDetail];
        
        // Filter out empty placeholder deposits from EPPS
        list = rawList.filter(d => d.DepositDate && !d.DepositDate.startsWith('0001'));
      }
      setDeposits(list);
    } catch (err) {
      console.error("Fetch Error:", err);
      alert("Failed to fetch deposits.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>Reconciliation & Deposits</Typography>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <TextField 
              fullWidth label="Start Date" type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField 
              fullWidth label="End Date" type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button 
              fullWidth variant="contained" size="large" 
              onClick={handleSearch} 
              disabled={loading}
              startIcon={<Search />}
            >
              Find Deposits
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Box>
        {deposits.length === 0 && !loading && (
          <Typography color="textSecondary" align="center">No deposits found for this period.</Typography>
        )}
        
        {deposits.map((deposit, index) => (
          <Accordion key={index} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ChevronDown />}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pr: 2, alignItems: 'center' }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    Batch Date: {new Date(deposit.DepositDate).toLocaleDateString()}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">ID: {deposit.OasisTransactionID || 'N/A'}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="h6" color="secondary.main" sx={{ fontWeight: 'bold' }}>
                    ${deposit.DepositTotal}
                  </Typography>
                  <Chip label={`${deposit.TransactionCount} Txns`} size="small" />
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>EFT ID</TableCell>
                      <TableCell>Cardholder</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {deposit.Transactions && deposit.Transactions.DepositTransaction && (
                      (Array.isArray(deposit.Transactions.DepositTransaction) 
                        ? deposit.Transactions.DepositTransaction 
                        : [deposit.Transactions.DepositTransaction]
                      ).map((tx, i) => (
                        <TableRow key={i}>
                          <TableCell>{tx.EftTransactionID}</TableCell>
                          <TableCell>{tx.CardHolderName} ({tx.CardHolderID})</TableCell>
                          <TableCell>{new Date(tx.EftDate).toLocaleDateString()}</TableCell>
                          <TableCell align="right">${tx.EftAmount}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </Box>
  );
};

export default Reconciliation;
