import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
} from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { unlinkWalletApi } from '../api/wallets';
import { Wallet } from '../types';

interface UnlinkWalletModalProps {
  open: boolean;
  wallet: Wallet;
  onClose: () => void;
  onSuccess: () => void;
}

export const UnlinkWalletModal: React.FC<UnlinkWalletModalProps> = ({
  open,
  wallet,
  onClose,
  onSuccess,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleUnlink = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await unlinkWalletApi(wallet.id);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memutus tautan wallet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinkOffIcon color="warning" /> Putus Tautan Rekan
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body1">
            Apakah Anda yakin ingin memutus tautan buku <strong>{wallet.name}</strong> dari rekan{' '}
            <strong>@{wallet.owner_username || 'pemilik'}</strong>?
          </Typography>

          <Alert severity="info">
            Setelah diputus, buku akan kembali menjadi buku tanpa pemilik (unlinked). Seluruh saldo ({wallet.balance ? wallet.balance : 0}) dan riwayat transaksi tetap tersimpan utuh dan tidak akan hilang. Anda dapat menautkannya kembali ke pengguna lain kapan saja.
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={isSubmitting}>
          Batal
        </Button>
        <Button
          variant="contained"
          color="warning"
          disabled={isSubmitting}
          onClick={handleUnlink}
          sx={{ fontWeight: 700 }}
        >
          {isSubmitting ? 'Memproses...' : 'Ya, Putus Tautan'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
