'use client';

import React, { useState } from 'react';
import { 
  ThemeProvider, 
  CssBaseline, 
  Box, 
  Drawer, 
  AppBar, 
  Toolbar, 
  List, 
  Typography, 
  Divider, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText,
  Container
} from '@mui/material';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  BookOpenText,
  AlertTriangle,
  Download
} from 'lucide-react';
import theme from './theme';

// Components
import Dashboard from './components/Dashboard';
import Cardholders from './components/Cardholders';
import WireApiDemo from './components/WireApiDemo';
import PendingSettlements from './components/PendingSettlements';
import SalesforceExport from './components/SalesforceExport';

const drawerWidth = 240;

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');

  const menuItems = [
    { text: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { text: 'Cardholders', icon: <Users size={20} /> },
    // { text: 'Wire API Demo', icon: <BookOpenText size={20} /> },
    { text: 'Pending Settlements', icon: <AlertTriangle size={20} /> },
    { text: 'Salesforce Export', icon: <Download size={20} /> },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'Dashboard': return <Dashboard />;
      case 'Cardholders': return <Cardholders />;
      // case 'Wire API Demo': return <WireApiDemo />;
      case 'Pending Settlements': return <PendingSettlements />;
      case 'Salesforce Export': return <SalesforceExport />;
      default: return <Dashboard />;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>
        <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, backgroundColor: '#fff', color: '#1a73e8', boxShadow: 'none', borderBottom: '1px solid #e0e0e0' }}>
          <Toolbar>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
              <CreditCard /> EPPS Service Portal
            </Typography>
          </Toolbar>
        </AppBar>
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', borderRight: '1px solid #e0e0e0' },
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: 'auto', mt: 2 }}>
            <List>
              {menuItems.map((item) => (
                <ListItem key={item.text} disablePadding>
                  <ListItemButton 
                    selected={activeTab === item.text}
                    onClick={() => setActiveTab(item.text)}
                    sx={{
                      mx: 1,
                      borderRadius: 2,
                      '&.Mui-selected': {
                        backgroundColor: 'primary.light',
                        color: 'primary.main',
                        '&:hover': { backgroundColor: 'primary.light' },
                        '& .MuiListItemIcon-root': { color: 'primary.main' }
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: activeTab === item.text ? 600 : 400 }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
            <Divider sx={{ my: 2 }} />
            <List>
              <ListItem disablePadding>
                <ListItemButton sx={{ mx: 1, borderRadius: 2 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}><Settings size={20} /></ListItemIcon>
                  <ListItemText primary="Settings" primaryTypographyProps={{ fontSize: '0.9rem' }} />
                </ListItemButton>
              </ListItem>
            </List>
          </Box>
        </Drawer>
        <Box component="main" sx={{ flexGrow: 1, p: 3, minHeight: '100vh', backgroundColor: 'background.default' }}>
          <Toolbar />
          <Container maxWidth={false} sx={{ maxWidth: '100%' }}>
            {renderContent()}
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
