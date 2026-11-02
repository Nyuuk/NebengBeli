import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import { useAuth } from '../context/AuthContext';

export const ClaimUsernameModal: React.FC = () => {
  const { user, updateUsername, logout } = useAuth();
  const [newUsername, setNewUsername] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isOpen = Boolean(user && user.needs_username_update);

  const validate = (val: string): string | null => {
    if (!val || val.length < 3) {
      return 'Username minimal 3 karakter.';
    }
    if (val.length > 30) {
      return 'Username maksimal 30 karakter.';
    }
    if (/\s/.test(val)) {
      return 'Username tidak boleh mengandung spasi.';
    }
    const regex = /^[a-z0-9_]{3,30}$/;
    if (!regex.test(val)) {
      return 'Username hanya boleh berisi huruf kecil (a-z), angka (0-9), dan garis bawah (_), tanpa spasi.';
    }
    return null;
  };

  // Suggest a normalized username candidate when modal opens
  useEffect(() => {
    if (user && user.needs_username_update) {
      const candidate = user.username
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
      setNewUsername(candidate);
      setError(validate(candidate));
    }
  }, [user]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErr = validate(newUsername);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUsername(newUsername);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memperbarui username.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <Dialog
      open={isOpen}
      disableEscapeKeyDown
      maxWidth="sm"
      fullWidth
      aria-labelledby="claim-username-title"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle
          id="claim-username-title"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            fontWeight: 700,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          <BadgeOutlinedIcon />
          Pembaruan Format Username
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Sistem sekarang menerapkan standardisasi username: <strong>tanpa spasi</strong> dan{' '}
            <strong>hanya huruf kecil</strong> untuk kemudahan pencarian dan keamanan penautan dompet.
          </Alert>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Username Anda saat ini adalah:{' '}
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {user?.username}
            </Box>
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Silakan pilih username baru Anda di bawah ini (kami telah menyarankan format yang sesuai):
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            required
            label="Username Baru"
            placeholder="contoh: adnan_rahmat"
            value={newUsername}
            onChange={(e) => {
              const val = e.target.value;
              setNewUsername(val);
              setError(validate(val));
            }}
            helperText="3-30 karakter: hanya huruf kecil (a-z), angka (0-9), dan garis bawah (_)."
            autoFocus
            inputProps={{
              maxLength: 30,
              'aria-label': 'Username Baru',
            }}
          />
        </DialogContent>

        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button
            type="button"
            color="inherit"
            onClick={handleLogout}
            disabled={isSubmitting}
            size="small"
          >
            Keluar (Logout)
          </Button>

          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || !newUsername.trim() || !!error}
          >
            {isSubmitting ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} color="inherit" />
                <span>Menyimpan...</span>
              </Box>
            ) : (
              'Simpan Username Baru'
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
