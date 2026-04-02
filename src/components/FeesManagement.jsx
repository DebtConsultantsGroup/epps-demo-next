'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  MenuItem,
  Alert,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Menu,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import { DollarSign, Briefcase, UserCheck, MoreVertical, Ban, Edit3 } from 'lucide-react';

const feeTypes = [
  { value: 'SettlementPayment', label: 'Settlement Payment (Third Party)' },
  { value: 'VendorFee', label: 'Vendor Fee (Program Revenue)' }
];

// Fee row component with action menu
const FeeRow = ({ row, onVoid, onUpdate }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  return (
    <TableRow>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {row.type === 'SettlementPayment' ? <Briefcase size={16} /> : <UserCheck size={16} />}
          <Typography variant="body2">{row.type === 'SettlementPayment' ? 'Settlement' : 'Vendor Fee'}</Typography>
        </Box>
      </TableCell>
      <TableCell>${row.amount}</TableCell>
      <TableCell>
        <Chip label={row.status} size="small" color={row.status === 'Pending' ? 'warning' : row.status === 'Voided' ? 'default' : 'success'} />
      </TableCell>
      <TableCell align="right">
        {row.status !== 'Voided' && (
          <>
            <IconButton size="small" onClick={handleMenuClick}>
              <MoreVertical size={16} />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={menuOpen}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem onClick={() => { handleMenuClose(); onUpdate(row); }}>
                <ListItemIcon><Edit3 size={16} /></ListItemIcon>
                <ListItemText>Update</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { handleMenuClose(); onVoid(row); }} sx={{ color: 'error.main' }}>
                <ListItemIcon><Ban size={16} color="#d32f2f" /></ListItemIcon>
                <ListItemText>Void</ListItemText>
              </MenuItem>
            </Menu>
          </>
        )}
      </TableCell>
    </TableRow>
  );
};

const FeesManagement = () => {
  const [formData, setFormData] = useState({
    cardholderId: '0040',
    feeType: 'SettlementPayment',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    // Settlement Specifics
    paidToName: '',
    paidToStreet: '',
    paidToCity: '',
    paidToState: '',
    paidToZip: ''
  });

  const [fees, setFees] = useState([
    { id: 101, type: 'SettlementPayment', amount: '450.00', status: 'Pending', date: '2023-10-25' },
    { id: 102, type: 'VendorFee', amount: '25.00', status: 'Transmitted', date: '2023-10-24' },
  ]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Update dialog state
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [selectedFee, setSelectedFee] = useState(null);
  const [updateForm, setUpdateForm] = useState({});

  const handleVoidFee = async (fee) => {
    if (!window.confirm(`Are you sure you want to void Fee ID: ${fee.id}?`)) return;

    try {
      const response = await fetch('/api/fees/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ FeeID: fee.id })
      });
      const data = await response.json();

      if (data.StatusCode === 'Success' || response.ok) {
        setFees(fees.map(f => f.id === fee.id ? { ...f, status: 'Voided' } : f));
        setMessage({ type: 'success', text: `Fee ${fee.id} voided successfully` });
      } else {
        setMessage({ type: 'error', text: data.Message || 'Failed to void fee' });
      }
    } catch (err) {
      console.error('Void failed:', err);
      setMessage({ type: 'error', text: 'Network error voiding fee' });
    }
  };

  const handleUpdateFee = (fee) => {
    setSelectedFee(fee);
    setUpdateForm({
      id: fee.id,
      amount: fee.amount,
      date: fee.date
    });
    setUpdateDialogOpen(true);
  };

  const handleSubmitUpdate = async () => {
    setUpdateLoading(true);
    try {
      const response = await fetch('/api/fees/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FeeID: updateForm.id,
          FeeAmount: updateForm.amount,
          FeeDate: `${updateForm.date}T00:00:00`
        })
      });
      const data = await response.json();

      if (data.StatusCode === 'Success' || response.ok) {
        setFees(fees.map(f => f.id === selectedFee.id ? { ...f, amount: updateForm.amount, date: updateForm.date } : f));
        setUpdateDialogOpen(false);
        setMessage({ type: 'success', text: `Fee ${selectedFee.id} updated successfully` });
      } else {
        setMessage({ type: 'error', text: data.Message || 'Failed to update fee' });
      }
    } catch (err) {
      console.error('Update failed:', err);
      setMessage({ type: 'error', text: 'Network error updating fee' });
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMessage(null);

    const payload = {
        CardHolderID: formData.cardholderId,
        FeeDate: `${formData.date}T00:00:00`,
        FeeAmount: formData.amount,
        FeeType: formData.feeType,
        Description: formData.description,
        // Conditionally add paidTo fields if it's a settlement
        ...(formData.feeType === 'SettlementPayment' && {
            PaidToName: formData.paidToName,
            PaidToStreet: formData.paidToStreet,
            PaidToCity: formData.paidToCity,
            PaidToState: formData.paidToState,
            PaidToZip: formData.paidToZip
        })
    };

    try {
        const response = await fetch('/api/fees/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (data.StatusCode === 'Success' || data.FeeID) {
            setMessage({ type: 'success', text: `Fee Created Successfully! ID: ${data.FeeID || 'N/A'}` });
            setFees([{ 
                id: data.FeeID || Math.floor(Math.random() * 1000), 
                type: formData.feeType, 
                amount: formData.amount, 
                status: 'Pending', 
                date: formData.date 
            }, ...fees]);
        } else {
            setMessage({ type: 'error', text: `Error: ${data.Message}` });
        }
    } catch (err) {
        console.error(err);
        setMessage({ type: 'error', text: 'Network Error' });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>Fee & Settlement Management</Typography>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 4 }}>
            <Typography variant="h6" sx={{ mb: 3 }}>Create New Fee</Typography>
            
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField 
                  select 
                  fullWidth 
                  label="Fee Type" 
                  value={formData.feeType}
                  onChange={(e) => setFormData({...formData, feeType: e.target.value})}
                >
                  {feeTypes.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField 
                  fullWidth 
                  label="Amount" 
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  InputProps={{ startAdornment: <DollarSign size={16} style={{ marginRight: 8, color: '#666' }} /> }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField 
                  fullWidth 
                  label="Date" 
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField 
                  fullWidth 
                  label="Cardholder ID" 
                  value={formData.cardholderId}
                  disabled
                />
              </Grid>

              {formData.feeType === 'SettlementPayment' && (
                <>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="subtitle2" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                      <Briefcase size={16} /> Third-Party Payee Details
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField 
                      fullWidth 
                      label="Paid To Name (Creditor)" 
                      value={formData.paidToName}
                      onChange={(e) => setFormData({...formData, paidToName: e.target.value})}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField 
                      fullWidth 
                      label="Street Address" 
                      value={formData.paidToStreet}
                      onChange={(e) => setFormData({...formData, paidToStreet: e.target.value})}
                    />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <TextField 
                      fullWidth 
                      label="City" 
                      value={formData.paidToCity}
                      onChange={(e) => setFormData({...formData, paidToCity: e.target.value})}
                    />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <TextField 
                      fullWidth 
                      label="State" 
                      value={formData.paidToState}
                      onChange={(e) => setFormData({...formData, paidToState: e.target.value})}
                    />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    <TextField 
                      fullWidth 
                      label="Zip" 
                      value={formData.paidToZip}
                      onChange={(e) => setFormData({...formData, paidToZip: e.target.value})}
                    />
                  </Grid>
                </>
              )}

              <Grid size={{ xs: 12 }}>
                <TextField 
                  fullWidth 
                  label="Description / Memo" 
                  multiline 
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </Grid>
            </Grid>

            {message && <Alert severity={message.type} sx={{ mt: 3 }}>{message.text}</Alert>}

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                variant="contained" 
                size="large"
                onClick={handleSubmit}
                disabled={loading || !formData.amount}
              >
                {loading ? 'Processing...' : 'Submit Fee'}
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Recent Activity</Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fees.map((row) => (
                  <FeeRow
                    key={row.id}
                    row={row}
                    onVoid={handleVoidFee}
                    onUpdate={handleUpdateFee}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>

      {/* Update Fee Dialog */}
      <Dialog open={updateDialogOpen} onClose={() => setUpdateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Edit3 size={20} />
          Update Fee {updateForm.id}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Amount"
                type="number"
                value={updateForm.amount || ''}
                onChange={(e) => setUpdateForm({ ...updateForm, amount: e.target.value })}
                InputProps={{ startAdornment: <DollarSign size={14} style={{ marginRight: 4, color: '#666' }} /> }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Date"
                type="date"
                value={updateForm.date || ''}
                onChange={(e) => setUpdateForm({ ...updateForm, date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUpdateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitUpdate}
            disabled={updateLoading || !updateForm.amount}
          >
            {updateLoading ? 'Updating...' : 'Update Fee'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FeesManagement;
