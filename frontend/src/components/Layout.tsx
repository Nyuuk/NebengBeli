import React from 'react';
import { Container, Box } from '@mui/material';
import { Navbar } from './Navbar';
import { OfflineBadge } from './OfflineBadge';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Navbar />
      <Container maxWidth="lg" sx={{ flex: 1, px: { xs: 2, sm: 3 }, py: { xs: 2.5, sm: 3 } }}>
        <OfflineBadge />
        {children}
      </Container>
    </Box>
  );
};
