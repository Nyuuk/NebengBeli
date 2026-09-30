import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockResetIcon from '@mui/icons-material/LockReset';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { changePasswordApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../context/OnlineStatusContext';

export const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!isOnline) {
      setError('Ganti kata sandi membutuhkan koneksi internet aktif.');
      return;
    }

    if (!currentPassword) {
      setError('Kata sandi saat ini wajib diisi.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Kata sandi baru minimal harus 6 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('Kata sandi baru harus berbeda dari kata sandi saat ini.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await changePasswordApi(currentPassword, newPassword);
      setSuccessMessage(
        res?.message || 'Kata sandi berhasil diubah! Sesi aktif Anda telah dicabut demi keamanan. Mengalihkan ke halaman login...'
      );

      // Password change revokes all active tokens on backend; logout and redirect
      setTimeout(async () => {
        try {
          await logout();
        } catch {
          // Ignore logout error if token already invalidated
        }
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string; error?: string };
      setError(apiErr.message || apiErr.error || 'Gagal mengubah kata sandi. Periksa kata sandi saat ini.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <Box sx={{ maxWidth: 540, mx: 'auto', mt: 2, mb: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/')}
          sx={{ mb: 2, textTransform: 'none' }}
        >
          Kembali ke Beranda
        </Button>

        <Card elevation={2} sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <LockResetIcon color="primary" sx={{ fontSize: 32, mr: 1.5 }} />
              <Box>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
                  Ganti Kata Sandi
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Akun: <strong>{user?.username}</strong>
                </Typography>
              </Box>
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Setelah kata sandi diubah, semua sesi aktif yang menggunakan kata sandi lama akan otomatis dicabut. Anda akan diminta login kembali dengan kata sandi baru.
            </Typography>

            <Divider sx={{ mb: 3 }} />

            {!isOnline && (
              <Alert severity="warning" icon={<WifiOffIcon />} sx={{ mb: 3 }}>
                Anda sedang offline. Aksi ganti kata sandi membutuhkan koneksi internet aktif ke server.
              </Alert>
            )}

            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {successMessage && (
              <Alert severity="success" sx={{ mb: 3 }}>
                {successMessage}
              </Alert>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <TextField
                label="Kata Sandi Saat Ini"
                type={showCurrentPassword ? 'text' : 'password'}
                fullWidth
                required
                margin="normal"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isLoading || !isOnline || Boolean(successMessage)}
                autoComplete="current-password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle current password visibility"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        edge="end"
                      >
                        {showCurrentPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Kata Sandi Baru"
                type={showNewPassword ? 'text' : 'password'}
                fullWidth
                required
                margin="normal"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading || !isOnline || Boolean(successMessage)}
                helperText="Minimal 6 karakter"
                autoComplete="new-password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle new password visibility"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        edge="end"
                      >
                        {showNewPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="Konfirmasi Kata Sandi Baru"
                type={showConfirmPassword ? 'text' : 'password'}
                fullWidth
                required
                margin="normal"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading || !isOnline || Boolean(successMessage)}
                error={Boolean(confirmPassword && newPassword !== confirmPassword)}
                helperText={
                  confirmPassword && newPassword !== confirmPassword
                    ? 'Konfirmasi tidak cocok dengan kata sandi baru'
                    : ''
                }
                autoComplete="new-password"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle confirm password visibility"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/')}
                  disabled={isLoading || Boolean(successMessage)}
                  sx={{ textTransform: 'none' }}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isLoading || !isOnline || Boolean(successMessage)}
                  sx={{ minWidth: 140, textTransform: 'none' }}
                >
                  {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Simpan Kata Sandi'}
                </Button>
              </Box>
            </form>
          </CardContent>
        </Card>
      </Box>
    </Layout>
  );
};
