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
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { moveEntryAdapter } from '../api/entries';
import { fetchAllAdminActiveWallets } from '../api/adminWallets';
import { getWalletsApi } from '../api/wallets';
import { getCachedWallets } from '../offline/db';
import { useOnlineStatus } from '../context/OnlineStatusContext';
import { useAuth } from '../context/AuthContext';
import { formatRupiah } from './BalanceCard';
import { Entry, Wallet } from '../types';

interface MoveEntryModalProps {
  open: boolean;
  sourceWalletId: string;
  targetEntry: Entry | null;
  onClose: () => void;
  onSuccess: (isOffline?: boolean) => void;
}

export const MoveEntryModal: React.FC<MoveEntryModalProps> = ({
  open,
  sourceWalletId,
  targetEntry,
  onClose,
  onSuccess,
}) => {
  const { isOnline, refreshPendingCount } = useOnlineStatus();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isValidTarget = (w: Wallet) => w.id !== sourceWalletId && !w.is_archived &&
    (isAdmin || Boolean(user && (w.creator_id === user.id || w.user_role === 'creator' || w.user_role === 'both')));
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadingWallets, setLoadingWallets] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setLoadingWallets(true);
      setSelectedWalletId('');
      const loadWallets = async () => {
        try {
          let list: Wallet[] = [];
          if (isOnline) {
            list = isAdmin ? await fetchAllAdminActiveWallets() : await getWalletsApi(false);
          } else {
            const cached = await getCachedWallets('all', user?.id);
            list = cached?.wallets || [];
          }
          const validWallets = (list || []).filter(isValidTarget);
          setWallets(validWallets);
          if (validWallets.length > 0) {
            setSelectedWalletId(validWallets[0].id);
          }
        } catch {
          // Fallback to cache
          const cached = await getCachedWallets('all', user?.id);
          const validWallets = (cached?.wallets || []).filter(isValidTarget);
          setWallets(validWallets);
          if (validWallets.length > 0) {
            setSelectedWalletId(validWallets[0].id);
          }
        } finally {
          setLoadingWallets(false);
        }
      };

      loadWallets();
    }
  }, [open, sourceWalletId, isOnline, user?.id, isAdmin]);

  if (!targetEntry) return null;

  const handleClose = () => {
    setError(null);
    setNotes('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!wallets.some((w) => w.id === selectedWalletId && isValidTarget(w))) {
      setError('Pilih wallet tujuan.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await moveEntryAdapter({
        source_wallet_id: sourceWalletId,
        target_wallet_id: selectedWalletId,
        targetEntry,
        notes: notes.trim(),
        isOnline,
        userId: user?.id,
      });

      if (res.is_offline) {
        await refreshPendingCount();
      }

      onSuccess(res.is_offline);
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
          Pindah Entri ke Buku Lain
        </DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!isOnline && (
            <Alert severity="info" icon={<CloudOffIcon />} sx={{ mb: 2 }}>
              Mode offline: Koreksi saldo pada buku asal dan titipan baru pada buku tujuan akan disimpan di antrean lokal dan disinkronkan saat terhubung kembali.
            </Alert>
          )}

          <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1.5, mb: 2.5 }}>
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
              Nominal:{' '}
              {formatRupiah(
                targetEntry.effective_amount !== undefined
                  ? targetEntry.effective_amount
                  : targetEntry.amount
              )}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <FormControl fullWidth disabled={loadingWallets || wallets.length === 0}>
              <InputLabel id="target-wallet-label">Pilih Buku Tujuan</InputLabel>
              <Select
                labelId="target-wallet-label"
                value={selectedWalletId}
                label="Pilih Buku Tujuan"
                onChange={(e) => setSelectedWalletId(e.target.value)}
              >
                {wallets.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.name} {w.owner_username ? `(Rekan: @${w.owner_username})` : '(Belum tertaut)'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {wallets.length === 0 && !loadingWallets && (
              <Alert severity="warning">
                Tidak ada buku tujuan aktif lain yang dikelola oleh Anda. Buat buku baru terlebih dahulu.
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
        <DialogActions>
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
