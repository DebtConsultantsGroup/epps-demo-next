import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  TextField, 
  Button, 
  Alert,
  Card,
  CardContent
} from '@mui/material';
import { CreditCard as CardIcon } from 'lucide-react';

const CreditCardPayments = () => {
  const [form, setForm] = useState({
    cardholderId: 'CH001',
    amount: '',
    cardNumber: '4111111111111111', // Test card default
    expDate: '',
    cvv: '',
    memo: ''
  });
  
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/cc/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CardHolderID: form.cardholderId,
          EftDate: new Date().toISOString(), // Immediate
          EftAmount: form.amount,
          CardNumber: form.cardNumber,
          ExpirationDate: form.expDate, // YYYY format usually required or MMYY
          CVV: form.cvv,
          Memo: form.memo
        })
      });
      const data = await response.json();
      
      if (data.StatusCode === 'Success') {
        setResult({ type: 'success', message: 'Payment Approved!', id: data.EftTransactionID });
      } else {
        setResult({ type: 'error', message: data.Message || 'Payment Declined' });
      }
    } catch (err) {
      setResult({ type: 'error', message: 'Processing Error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>One-Time Credit Card Charge</Typography>
      
      <Grid container spacing={4}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 4 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              Sandbox Mode: Use card <b>4111111111111111</b> for approval.
            </Alert>
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField 
                  fullWidth label="Cardholder ID" 
                  value={form.cardholderId} 
                  onChange={(e) => setForm({...form, cardholderId: e.target.value})}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField 
                  fullWidth label="Amount" type="number"
                  value={form.amount} 
                  onChange={(e) => setForm({...form, amount: e.target.value})}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField 
                  fullWidth label="Card Number" 
                  value={form.cardNumber} 
                  onChange={(e) => setForm({...form, cardNumber: e.target.value})}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField 
                  fullWidth label="Exp Date (MMYY)" 
                  value={form.expDate} 
                  onChange={(e) => setForm({...form, expDate: e.target.value})}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField 
                  fullWidth label="CVV" 
                  value={form.cvv} 
                  onChange={(e) => setForm({...form, cvv: e.target.value})}
                />
              </Grid>
              
              <Grid item xs={12} sx={{ mt: 2 }}>
                <Button 
                  fullWidth variant="contained" size="large" 
                  startIcon={<CardIcon />}
                  onClick={handleSubmit}
                  disabled={loading || !form.amount}
                >
                  {loading ? 'Processing...' : 'Process Payment'}
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          {result && (
            <Card sx={{ bgcolor: result.type === 'success' ? '#e8f5e9' : '#ffebee' }}>
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <Typography variant="h4" color={result.type === 'success' ? 'secondary' : 'error'}>
                  {result.message}
                </Typography>
                {result.id && (
                  <Typography variant="subtitle1" sx={{ mt: 2 }}>
                    Transaction ID: {result.id}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default CreditCardPayments;
