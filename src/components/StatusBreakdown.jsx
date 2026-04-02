import React from 'react';
import { Box, Paper, Typography, Tooltip } from '@mui/material';

const StatusBreakdown = ({ title, stats, showAmounts = false }) => {
  if (!stats || !stats.byStatus) {
    return (
      <Paper sx={{ p: 2, height: '100%' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>{title}</Typography>
        <Typography variant="body2" color="textSecondary">Loading...</Typography>
      </Paper>
    );
  }

  // Filter out statuses with zero count and convert to array
  const statusEntries = Object.entries(stats.byStatus)
    .filter(([, data]) => data.count > 0)
    .sort((a, b) => b[1].count - a[1].count);

  const totalCount = statusEntries.reduce((sum, [, data]) => sum + data.count, 0);

  if (totalCount === 0) {
    return (
      <Paper sx={{ p: 2, height: '100%' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>{title}</Typography>
        <Typography variant="body2" color="textSecondary">No data available</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>{title}</Typography>

      {/* Stacked horizontal bar */}
      <Box sx={{
        display: 'flex',
        height: 24,
        borderRadius: 1,
        overflow: 'hidden',
        mb: 2
      }}>
        {statusEntries.map(([code, data]) => {
          const percentage = (data.count / totalCount) * 100;
          return (
            <Tooltip
              key={code}
              title={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{data.label}</Typography>
                  <Typography variant="caption">Count: {data.count}</Typography>
                  {showAmounts && data.amount !== undefined && (
                    <Typography variant="caption" display="block">
                      Amount: ${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Typography>
                  )}
                </Box>
              }
              arrow
            >
              <Box
                sx={{
                  width: `${percentage}%`,
                  minWidth: percentage > 0 ? 8 : 0,
                  backgroundColor: data.color,
                  transition: 'width 0.3s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    opacity: 0.85
                  }
                }}
              />
            </Tooltip>
          );
        })}
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {statusEntries.map(([code, data]) => (
          <Box key={code} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: data.color
              }}
            />
            <Typography variant="caption" color="textSecondary">
              {data.label}: {data.count}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Total */}
      <Typography variant="caption" color="textSecondary" sx={{ mt: 1.5, display: 'block' }}>
        Total: {totalCount}
      </Typography>
    </Paper>
  );
};

export default StatusBreakdown;
