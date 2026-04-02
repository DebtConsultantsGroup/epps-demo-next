import React, { useState } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  TextField, 
  Button, 
  Divider,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  Tooltip
} from '@mui/material';
import { HelpCircle, Info } from 'lucide-react';

const EFTManagement = () => {
  const [eftData, setEftData] = useState({
    cardholderId: '0040',
    amount: '',
    programFee: '',
    accountNumber: '',
    routingNumber: ''
  });

  const [simulatedStatus, setSimulatedStatus] = useState(0); // 0: Idle, 1: Pending, 2: Transmitted, 3: Settled
  const [error, setError] = useState('');

  const calculateTrustAmount = () => {
    const total = parseFloat(eftData.amount) || 0;
    const fee = parseFloat(eftData.programFee) || 0;
    return (total - fee).toFixed(2);
  };

  const handleCreateEft = async () => {
    setError('');
    const total = parseFloat(eftData.amount);
    const fee = parseFloat(eftData.programFee);

    if (fee > total) {
      setError('EPPS Validation Error: EFT Fee cannot be greater than EFT Amount.');
      return;
    }

    // Prepare Date: Today at 00:00:00 or tomorrow? EPPS usually requires future or today.
    // Using simple ISO string for now.
    const today = new Date().toISOString().split('T')[0] + 'T00:00:00';

    const payload = {
      CardHolderID: eftData.cardholderId,
      EftDate: today,
      EftAmount: total.toFixed(2),
      EftFee: fee.toFixed(2),
      AccountNumber: eftData.accountNumber,
      RoutingNumber: eftData.routingNumber,
      AccountType: 'Checking', // Defaulting for demo
      Memo: 'Demo Transaction'
    };

    setSimulatedStatus(1); // Set to "Pending" visual state immediately

    try {
      const response = await fetch('/api/eft/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (data.StatusCode === 'Success' || data.EftTransactionID) {
         setSimulatedStatus(2); // Transmitted/Success state
         // In a real app, we'd save the EftTransactionID
         console.log("EFT Created, ID:", data.EftTransactionID);
      } else {
         setError(`API Error: ${data.Message}`);
         setSimulatedStatus(0); // Reset on failure
      }
    } catch (err) {
      console.error(err);
      setError('Network or Proxy Error');
      setSimulatedStatus(0);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>EFT Transaction Wizard (AddEft)</Typography>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ mb: 3 }}>Schedule New Debit</Typography>
            
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <TextField 
                  fullWidth label="Cardholder ID" 
                  value={eftData.cardholderId}
                  disabled
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField 
                  fullWidth 
                  label="EFT Amount (Withdrawal)" 
                  type="number"
                  placeholder="0.00"
                  value={eftData.amount}
                  onChange={(e) => setEftData({...eftData, amount: e.target.value})}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField 
                  fullWidth 
                  label="Program Fee (Your Revenue)" 
                  type="number"
                  placeholder="0.00"
                  value={eftData.programFee}
                  onChange={(e) => setEftData({...eftData, programFee: e.target.value})}
                  InputProps={{
                    endAdornment: (
                      <Tooltip title="This is the portion EPPS sends to your program.">
                        <HelpCircle size={16} style={{ marginLeft: 8, color: '#aaa' }} />
                      </Tooltip>
                    )
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ my: 1 }} />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Info size={16} /> Banking details for ACH Withdrawal
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField 
                  fullWidth label="Routing Number" 
                  value={eftData.routingNumber}
                  onChange={(e) => setEftData({...eftData, routingNumber: e.target.value})}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField 
                  fullWidth label="Account Number" 
                  value={eftData.accountNumber}
                  onChange={(e) => setEftData({...eftData, accountNumber: e.target.value})}
                />
              </Grid>
            </Grid>

            {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                variant="contained" 
                size="large"
                onClick={handleCreateEft}
                disabled={!eftData.amount || simulatedStatus > 0}
              >
                Submit to EPPS
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Box sx={{ position: 'sticky', top: 100 }}>
            <Card sx={{ mb: 3, borderLeft: '4px solid', borderColor: 'primary.main' }}>
              <CardContent>
                <Typography variant="overline" color="primary" sx={{ fontWeight: 'bold' }}>Transaction Breakdown</Typography>
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography>Total Withdrawal:</Typography>
                    <Typography sx={{ fontWeight: 'bold' }}>${parseFloat(eftData.amount || 0).toFixed(2)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, color: 'info.main' }}>
                    <Typography>Program Fee (Credit):</Typography>
                    <Typography sx={{ fontWeight: 'bold' }}>+ ${parseFloat(eftData.programFee || 0).toFixed(2)}</Typography>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', color: 'secondary.main' }}>
                    <Typography sx={{ fontWeight: 'bold' }}>Trust Deposit:</Typography>
                    <Typography sx={{ fontWeight: 'bold' }}>${calculateTrustAmount()}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {simulatedStatus > 0 && (
              <Paper sx={{ p: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 3 }}>EFT Status Lifecycle</Typography>
                <Stepper activeStep={simulatedStatus} orientation="vertical">
                  <Step>
                    <StepLabel>Created (Create EFT Pending)</StepLabel>
                  </Step>
                  <Step>
                    <StepLabel>Transmitted (Sent to ACH)</StepLabel>
                  </Step>
                  <Step>
                    <StepLabel>Settled (Success)</StepLabel>
                  </Step>
                </Stepper>
              </Paper>
            )}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default EFTManagement;
