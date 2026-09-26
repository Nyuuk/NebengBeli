import React, { useState } from 'react';
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
  Alert,
  InputAdornment,
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { createEntryApi } from '../api/entries';
import { queueOfflineEntry } from '../offline/db';
import { useOnlineStatus } from '../context/OnlineStatusContext';
import { EntryType, Entry } from '../types';

interface EntryModalProps {
  open: boolean;
  walletId: string;
  onClose: () => void;
  onSuccess: (entry: Entry, isOffline?: boolean) => void;
}

export const EntryModal: React.FC<EntryModalProps> = ({
  open,
  walletId,
  onClose,
  onSuccess,
}) => {
  const { isOnline, refreshPendingCount } = useOnlineStatus();
  const [type, setType] = useState<EntryType>('titipan');
  const [amountStr, setAmountStr] = useState<string>('');
  const [itemName, setItemName] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleClose = () => {
    setError(null);
    setAmountStr('');
    setItemName('');
    setNote('');
    setType('titipan');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseInt(amountStr.replace(/[^0-9]/g, ''), 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Nominal harus lebih dari 0.');
      return;
    }

    if (!itemName.trim()) {
      setError('Nama barang/transaksi tidak boleh kosong.');
      return;
    }

    const clientId = uuidv4();
    setIsSubmitting(true);
    const now = new Date().toISOString();

    if (!isOnline) {
      // Offline mode: Save directly to IndexedDB queue
      try {
        const pendingItem = {
          client_id: clientId,
          wallet_id: walletId,
          type,
          amount: type === 'topup' ? -parsedAmount : parsedAmount,
          item_name: itemName.trim(),
          note: note.trim(),
          occurred_at: now,
          created_at: now,
          retry_count: 0,
        };
        await queueOfflineEntry(pendingItem);
        await refreshPendingCount();

        const mockEntry: Entry = {
          id: clientId,
          client_id: clientId,
          wallet_id: walletId,
          type,
          amount: pendingItem.amount,
          item_name: pendingItem.item_name,
          note: pendingItem.note,
          occurred_at: now,
          created_by: 'me',
          created_at: now,
          created_by_username: 'Anda (Offline)',
          is_offline_pending: true,
        };

        onSuccess(mockEntry, true);
        handleClose();
      } catch (err) {
        setError('Gagal menyimpan entri offline ke memori lokal.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Online mode: Call API
    try {
      const res = await createEntryApi(walletId, {
        client_id: clientId,
        type,
        amount: parsedAmount,
        item_name: itemName.trim(),
        note: note.trim(),
        occurred_at: now,
      });

      onSuccess(res.entry, false);
      handleClose();
    } catch (err: unknown) {
      // If network failure occurs during submit, fallback to offline queue
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 0) {
        const pendingItem = {
          client_id: clientId,
          wallet_id: walletId,
          type,
          amount: type === 'topup' ? -parsedAmount : parsedAmount,
          item_name: itemName.trim(),
          note: note.trim(),
          occurred_at: now,
          created_at: now,
          retry_count: 0,
        };
        await queueOfflineEntry(pendingItem);
        await refreshPendingCount();

        const mockEntry: Entry = {
          id: clientId,
          client_id: clientId,
          wallet_id: walletId,
          type,
          amount: pendingItem.amount,
          item_name: pendingItem.item_name,
          note: pendingItem.note,
          occurred_at: now,
          created_by: 'me',
          created_at: now,
          created_by_username: 'Anda (Offline)',
          is_offline_pending: true,
        };

        onSuccess(mockEntry, true);
        handleClose();
      } else {
        setError(apiErr.message || 'Gagal menambahkan entri ledger.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Tambah Entri Buku Ledger
        </DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {!isOnline && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Mode offline aktif: Entri akan disimpan lokal dan dikirim saat jaringan kembali aktif.
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <FormControl fullWidth>
              <InputLabel id="entry-type-label">Tipe Entri</InputLabel>
              <Select
                labelId="entry-type-label"
                value={type}
                label="Tipe Entri"
                onChange={(e) => setType(e.target.value as EntryType)}
              >
                <MenuItem value="titipan">
                  Titipan Baru (Pengeluaran yang ditalangi / Beban)
                </MenuItem>
                <MenuItem value="topup">
                  Topup / Pembayaran (Pelunasan / Pengembalian Uang)
                </MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Nominal"
              fullWidth
              required
              placeholder="Contoh: 50.000"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">Rp</InputAdornment>,
              }}
              helperText={
                type === 'titipan'
                  ? 'Menambah jumlah hutang/talangan yang harus dibayar.'
                  : 'Mengurangi jumlah hutang (melunasi tagihan).'
              }
            />

            <TextField
              label="Nama Barang / Keperluan"
              fullWidth
              required
              placeholder="Contoh: Nasi Padang Paket Rendang"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
            />

            <TextField
              label="Catatan Tambahan (Opsional)"
              fullWidth
              multiline
              rows={2}
              placeholder="Contoh: Sudah termasuk es teh dan kerupuk"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            disabled={isSubmitting}
            sx={{ px: 3, fontWeight: 600 }}
          >
            {isSubmitting ? 'Menyimpan...' : 'Simpan Entri'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
