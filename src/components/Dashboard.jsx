import React, { useState, useMemo } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Button,
  CircularProgress,
  TextField,
  Chip,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X
} from 'lucide-react';

import StatusMonitor from './StatusMonitor';
import StatusBreakdown from './StatusBreakdown';
import useDashboardStats from '../hooks/useDashboardStats';

const chartData = [
  { name: 'Mon', settled: 4000, pending: 2400 },
  { name: 'Tue', settled: 3000, pending: 1398 },
  { name: 'Wed', settled: 2000, pending: 9800 },
  { name: 'Thu', settled: 2780, pending: 3908 },
  { name: 'Fri', settled: 1890, pending: 4800 },
];

// Preset options for aggregate view (max 7 days due to API limitation)
const DATE_PRESETS = [
  { label: '6h', value: '6h', hours: 6 },
  { label: '24h', value: '24h', hours: 24 },
  { label: '1d', value: '1d', days: 1 },
  { label: '3d', value: '3d', days: 3 },
  { label: '7d', value: '7d', days: 7 },
];

const getDateRangeFromPreset = (preset) => {
  const now = new Date();
  const end = now.toISOString().split('.')[0];
  const start = new Date(now);

  const presetConfig = DATE_PRESETS.find(p => p.value === preset);
  if (presetConfig?.hours) {
    start.setHours(start.getHours() - presetConfig.hours);
  } else if (presetConfig?.days) {
    start.setDate(start.getDate() - (presetConfig.days - 1));
    start.setHours(0, 0, 0, 0);
  }

  return {
    startDate: start.toISOString().split('.')[0],
    endDate: end
  };
};

const formatDateForInput = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

const StatCard = ({ title, value, icon, color, loading }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography color="textSecondary" variant="overline" sx={{ fontWeight: 'bold' }}>
            {title}
          </Typography>
          <Typography variant="h4" sx={{ mt: 1, fontWeight: 'bold' }}>
            {loading ? <CircularProgress size={28} /> : value}
          </Typography>
        </Box>
        <Box sx={{
          backgroundColor: `${color}.light`,
          p: 1,
          borderRadius: 2,
          color: `${color}.main`,
          display: 'flex'
        }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const formatCurrency = (amount) => {
  if (amount === undefined || amount === null) return '$0.00';
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Dashboard = () => {
  const [selectedCardholder, setSelectedCardholder] = useState(null);
  const [datePreset, setDatePreset] = useState('7d');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate date range based on mode
  const dateRange = useMemo(() => {
    if (selectedCardholder) {
      // Cardholder mode: use custom dates or null for all time
      if (customStartDate && customEndDate) {
        return {
          startDate: `${customStartDate}T00:00:00`,
          endDate: `${customEndDate}T23:59:59`
        };
      }
      return null; // All time
    } else {
      // Aggregate mode: use preset
      return getDateRangeFromPreset(datePreset);
    }
  }, [selectedCardholder, datePreset, customStartDate, customEndDate]);

  const { eftStats, feeStats, cardholderStats, cardholders, loading, refresh } = useDashboardStats(selectedCardholder, dateRange);

  const handleCardholderChange = (event) => {
    const value = event.target.value;
    setSelectedCardholder(value === '' ? null : value);
    // Reset custom dates when switching to cardholder mode
    if (value !== '') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
  };

  const clearFilter = () => {
    setSelectedCardholder(null);
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const handlePresetChange = (event, newPreset) => {
    if (newPreset !== null) {
      setDatePreset(newPreset);
    }
  };

  const selectedCardholderName = selectedCardholder
    ? cardholders.find(c => c.id === selectedCardholder)?.name
    : null;

  const getDateRangeLabel = () => {
    if (selectedCardholder) {
      if (customStartDate && customEndDate) {
        return `${customStartDate} to ${customEndDate}`;
      }
      return 'All Time';
    }
    const preset = DATE_PRESETS.find(p => p.value === datePreset);
    return preset ? `Last ${preset.label}` : '';
  };

  return (
    <Box>
      {/* Header Row */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5">System Overview</Typography>
          {selectedCardholder && (
            <Chip
              label={`${selectedCardholderName}`}
              color="primary"
              onDelete={clearFilter}
              deleteIcon={<X size={16} />}
            />
          )}
        </Box>
        <Button
          size="small"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
          onClick={refresh}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Filter Row */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 4, md: 3 }}>
            <TextField
              select
              size="small"
              label="Cardholder"
              value={selectedCardholder || ''}
              onChange={handleCardholderChange}
              SelectProps={{ native: true }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            >
              <option value="">All Cardholders</option>
              {cardholders.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.id} - {ch.name}
                </option>
              ))}
            </TextField>
          </Grid>

          {!selectedCardholder ? (
            // Aggregate mode: Show presets
            <Grid size={{ xs: 12, sm: 8, md: 6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2" color="textSecondary" sx={{ whiteSpace: 'nowrap' }}>
                  Time Range:
                </Typography>
                <ToggleButtonGroup
                  value={datePreset}
                  exclusive
                  onChange={handlePresetChange}
                  size="small"
                >
                  {DATE_PRESETS.map((preset) => (
                    <ToggleButton key={preset.value} value={preset.value}>
                      {preset.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Typography variant="caption" color="textSecondary">
                  (API max: 7 days)
                </Typography>
              </Box>
            </Grid>
          ) : (
            // Cardholder mode: Show date pickers
            <>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <TextField
                  type="date"
                  size="small"
                  label="Start Date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2 }}>
                <TextField
                  type="date"
                  size="small"
                  label="End Date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4, md: 3 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {(customStartDate || customEndDate) && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                    >
                      Clear Dates (All Time)
                    </Button>
                  )}
                </Box>
              </Grid>
            </>
          )}

          <Grid size={{ xs: 12, md: 'auto' }} sx={{ ml: 'auto' }}>
            <Chip
              label={getDateRangeLabel()}
              variant="outlined"
              size="small"
              color={selectedCardholder && !customStartDate ? 'success' : 'default'}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Stat Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Settled"
            value={formatCurrency(eftStats?.totalSettled)}
            icon={<CheckCircle2 size={24} />}
            color="secondary"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Pending ACH"
            value={formatCurrency(eftStats?.totalPending)}
            icon={<Clock size={24} />}
            color="primary"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Program Fees"
            value={formatCurrency(feeStats?.totalAmount)}
            icon={<TrendingUp size={24} />}
            color="info"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Returns/NSF"
            value={eftStats?.returnCount ?? 0}
            icon={<AlertCircle size={24} />}
            color="error"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Chart and Status Monitor Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Settlement Activity (5-Day Cycle)</Typography>
            <Box sx={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorSettled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34a853" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#34a853" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="settled" stroke="#34a853" fillOpacity={1} fill="url(#colorSettled)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatusMonitor />
        </Grid>
      </Grid>

      {/* Status Breakdown Row */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatusBreakdown
            title={`EFT Status (${getDateRangeLabel()})`}
            stats={eftStats}
            showAmounts={true}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatusBreakdown
            title={`Fee Status (${getDateRangeLabel()})`}
            stats={feeStats}
            showAmounts={true}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <StatusBreakdown
            title={selectedCardholder ? "Cardholder Status" : "Cardholder Distribution"}
            stats={cardholderStats}
            showAmounts={false}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
