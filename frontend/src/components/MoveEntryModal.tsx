import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import { moveEntryApi } from '../api/entries';
import { getWalletsApi } from '../api/wallets';
import { formatRupiah } from './BalanceCard';
import { Entry, Wallet } from '../types';

interface MoveEntryModalProps {
  open: boolean;
  sourceWalletId: string;
  targetEntry: Entry | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const MoveEntryModal: React.FC<MoveEntryModalProps> = ({
  open,
  sourceWalletId,
  targetEntry,
  onClose,
  onSuccess,
}) => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadingWallets, setLoadingWallets] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setLoadingWallets(true);
      getWalletsApi(false)
        .then((list) => {
          const validWallets = list.filter((w) => w.id !== sourceWalletId && !w.is_archived);
          setWallets(validWallets);
          if (validWallets.length > 0) {
            setSelectedWalletId(validWallets[0].id);
          }
        })
        .catch(() => setError('Gagal memuat daftar wallet tujuan.'))
        .finally(() => setLoadingWallets(false));
    }
  }, [open, sourceWalletId]);

  if (!targetEntry) return null;

  const handleClose = () => {
    setError(null);
    setNotes('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedWalletId) {
      setError('Pilih wallet tujuan.');
      return;
    }

    setIsSubmitting(true);
    try {
      await moveEntryApi({
        source_wallet_id: sourceWalletId,
        target_wallet_id: selectedWalletId,
        entry_id: targetEntry.id,
        notes: notes.trim(),
      });

      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memindahkan entri.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Pindah Entri ke Wallet Lain
        </DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 2, mb: 2.5 }}>
            <Typography variant="caption" color="text.secondary">
              Entri yang akan Dipindah:
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {targetEntry.item_name}
            </Typography>
            {targetEntry.note && (
              <Typography variant="body2" color="text.secondary">
                Catatan: {targetEntry.note}
              </Typography>
            )}
            <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
              Nominal: {formatRupiah(targetEntry.amount)}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <FormControl fullWidth disabled={loadingWallets || wallets.length === 0}>
              <InputLabel id="target-wallet-label">Pilih Wallet Tujuan</InputLabel>
              <Select
                labelId="target-wallet-label"
                value={selectedWalletId}
                label="Pilih Wallet Tujuan"
                onChange={(e) => setSelectedWalletId(e.target.value)}
              >
                {wallets.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.name} {w.owner_username ? `(Owner: ${w.owner_username})` : '(Belum tertaut)'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {wallets.length === 0 && !loadingWallets && (
              <Alert severity="warning">
                Tidak ada wallet tujuan yang tersedia. Buat wallet baru terlebih dahulu.
              </Alert>
            )}

            <TextField
              label="Catatan Pemindahan (Opsional)"
              fullWidth
              multiline
              rows={2}
              placeholder="Contoh: Salah catat ke buku A, seharusnya buku B"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose} color="inherit" disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || wallets.length === 0}
            sx={{ px: 3, fontWeight: 600 }}
          >
            {isSubmitting ? 'Memindahkan...' : 'Pindahkan Entri'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
