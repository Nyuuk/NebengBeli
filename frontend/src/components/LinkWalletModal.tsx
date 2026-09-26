import React, { useState } from 'react';
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
} from '@mui/material';
import { createLinkRequestApi } from '../api/linkRequests';
import { LinkRequest } from '../types';

interface LinkWalletModalProps {
  open: boolean;
  walletId: string;
  walletName: string;
  onClose: () => void;
  onSuccess: (linkReq: LinkRequest) => void;
}

export const LinkWalletModal: React.FC<LinkWalletModalProps> = ({
  open,
  walletId,
  walletName,
  onClose,
  onSuccess,
}) => {
  const [targetUsername, setTargetUsername] = useState<string>('');
  const [createdLink, setCreatedLink] = useState<LinkRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleClose = () => {
    setError(null);
    setTargetUsername('');
    setCreatedLink(null);
    onClose();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetUsername.trim()) {
      setError('Masukkan username teman yang ingin ditautkan.');
      return;
    }

    setIsSubmitting(true);

    try {
      const link = await createLinkRequestApi(walletId, targetUsername.trim());
      setCreatedLink(link);
      onSuccess(link);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal membuat permintaan tautan wallet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        Tautkan Wallet: {walletName}
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!createdLink ? (
          <form onSubmit={handleGenerate}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Kirim permintaan tautan ke username teman Anda. Setelah teman Anda menyetujui (approve) permintaan ini, teman Anda akan menjadi Pemilik (Owner) wallet ini untuk mencatat dan memantau ledger bersama.
            </Typography>

            <TextField
              label="Username Teman"
              fullWidth
              required
              placeholder="Contoh: budi_santoso"
              value={targetUsername}
              onChange={(e) => setTargetUsername(e.target.value)}
              helperText="Permintaan akan dikirimkan ke akun teman ini untuk disetujui."
              sx={{ mb: 2 }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={isSubmitting}
              sx={{ py: 1.2, fontWeight: 600 }}
            >
              {isSubmitting ? 'Mengirim Permintaan...' : 'Kirim Permintaan Tautan'}
            </Button>
          </form>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="success">
              Permintaan tautan berhasil dikirim ke <strong>{createdLink.target_username || targetUsername}</strong>!
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Status permintaan saat ini: <strong>{createdLink.status}</strong>. Wallet akan tertaut setelah disetujui.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} variant="outlined">
          Tutup
        </Button>
      </DialogActions>
    </Dialog>
  );
};
