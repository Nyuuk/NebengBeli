import React from 'react';
import { Container, Box } from '@mui/material';
import { Navbar } from './Navbar';
import { OfflineBadge } from './OfflineBadge';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8f9fa' }}>
      <Navbar />
      <Container maxWidth="lg" sx={{ mt: 3, mb: 4, flex: 1, px: { xs: 2, sm: 3 } }}>
        <OfflineBadge />
        {children}
      </Container>
    </Box>
  );
};
