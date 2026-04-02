'use client';

import React, { useEffect, useState } from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemAvatar, 
  Avatar, 
  Divider,
  Button
} from '@mui/material';
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

const StatusMonitor = () => {
  const [updates, setUpdates] = useState([]);
  const [lastChecked, setLastChecked] = useState(new Date());

  const fetchUpdates = async () => {
    // Check for status changes today
    const today = new Date().toISOString().split('T')[0];
    try {
      const response = await fetch('/api/eft/status-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          StatusDateFrom: `${today}T00:00:00`,
          StatusDateTo: `${today}T23:59:59`
        })
      });
      const data = await response.json();
      
      let list = [];
      if (data && data.EFTList && data.EFTList.EFTTransactionDetail) {
        list = Array.isArray(data.EFTList.EFTTransactionDetail) 
          ? data.EFTList.EFTTransactionDetail 
          : [data.EFTList.EFTTransactionDetail];
      }
      setUpdates(list);
      setLastChecked(new Date());
    } catch (err) {
      console.error("Status check failed", err);
    }
  };

  useEffect(() => {
    fetchUpdates();
  }, []);

  const getIcon = (status) => {
    if (status === 'Settled') return <CheckCircle color="#34a853" />;
    if (status === 'Returned') return <XCircle color="#d32f2f" />;
    return <Clock color="#1a73e8" />;
  };

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Status Feed (Today)</Typography>
        <Button size="small" startIcon={<RefreshCw size={16} />} onClick={fetchUpdates}>
          Refresh
        </Button>
      </Box>
      <Divider />
      
      <List sx={{ maxHeight: 400, overflow: 'auto' }}>
        {updates.length === 0 && (
          <ListItem>
            <ListItemText secondary="No status changes found today." />
          </ListItem>
        )}
        
        {updates.map((item, i) => (
          <React.Fragment key={i}>
            <ListItem alignItems="flex-start">
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: 'transparent' }}>
                  {getIcon(item.StatusCode)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={`EFT #${item.EftTransactionID} is now ${item.StatusCode}`}
                secondary={
                  <React.Fragment>
                    <Typography component="span" variant="body2" color="text.primary">
                      {item.LastMessage || 'Status updated from ACH'}
                    </Typography>
                    <br />
                    {new Date(item.StatusDate).toLocaleTimeString()}
                  </React.Fragment>
                }
              />
            </ListItem>
            <Divider variant="inset" component="li" />
          </React.Fragment>
        ))}
      </List>
      
      <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
        Last checked: {lastChecked.toLocaleTimeString()}
      </Typography>
    </Paper>
  );
};

export default StatusMonitor;
