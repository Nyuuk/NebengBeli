import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Menu,
  MenuItem,
  Chip,
  Avatar,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LinkIcon from '@mui/icons-material/Link';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();
    const loggedOut = await logout();
    if (loggedOut) {
      navigate('/login');
    }
  };

  return (
    <AppBar position="sticky" elevation={1} sx={{ backgroundColor: '#1976d2' }}>
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box
          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <AccountBalanceWalletIcon sx={{ mr: 1, fontSize: 28 }} />
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>
            NebengBeli
          </Typography>
        </Box>

        {user ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              color="inherit"
              startIcon={<LinkIcon />}
              onClick={() => navigate('/links')}
              sx={{ textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Undangan
            </Button>

            {user.role === 'admin' && (
              <Button
                color="inherit"
                startIcon={<AdminPanelSettingsIcon />}
                onClick={() => navigate('/admin')}
                sx={{ textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}
              >
                Admin
              </Button>
            )}

            <Chip
              avatar={<Avatar sx={{ bgcolor: '#0d47a1', color: '#fff' }}>{user.username[0]?.toUpperCase()}</Avatar>}
              label={user.username}
              onClick={handleMenuOpen}
              color="primary"
              variant="outlined"
              sx={{
                bgcolor: 'rgba(255, 255, 255, 0.15)',
                color: '#fff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            />

            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem disabled sx={{ opacity: '1 !important' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {user.username}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Role: {user.role}
                  </Typography>
                </Box>
              </MenuItem>
              <MenuItem onClick={() => { handleMenuClose(); navigate('/links'); }}>
                <LinkIcon fontSize="small" sx={{ mr: 1 }} /> Kelola Undangan
              </MenuItem>
              <MenuItem onClick={() => { handleMenuClose(); navigate('/change-password'); }}>
                <LockResetIcon fontSize="small" sx={{ mr: 1 }} /> Ganti Kata Sandi
              </MenuItem>
              {user.role === 'admin' && (
                <MenuItem onClick={() => { handleMenuClose(); navigate('/admin'); }}>
                  <AdminPanelSettingsIcon fontSize="small" sx={{ mr: 1 }} /> Admin Panel
                </MenuItem>
              )}
              <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button color="inherit" onClick={() => navigate('/login')}>
              Login
            </Button>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => navigate('/register')}
              sx={{ bgcolor: '#ffffff', color: '#1976d2', '&:hover': { bgcolor: '#f0f0f0' } }}
            >
              Daftar
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};
