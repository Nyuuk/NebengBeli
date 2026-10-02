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
  InputAdornment,
  ButtonGroup,
  Chip,
  Paper,
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { createEntryApi } from '../api/entries';
import { queueOfflineEntry } from '../offline/db';
import { useOnlineStatus } from '../context/OnlineStatusContext';
import { formatRupiah } from './BalanceCard';
import { Entry } from '../types';

interface CorrectionModalProps {
  open: boolean;
  walletId: string;
  targetEntry: Entry | null;
  onClose: () => void;
  onSuccess: (entry: Entry, isOffline?: boolean) => void;
}

const QUICK_REASONS = ['Salah Harga', 'Batal', 'Salah Dompet', 'Lainnya'];

export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  open,
  walletId,
  targetEntry,
  onClose,
  onSuccess,
}) => {
  const { isOnline, refreshPendingCount } = useOnlineStatus();
  const [correctAmountStr, setCorrectAmountStr] = useState<string>('');
  const [selectedReason, setSelectedReason] = useState<string>('Salah Harga');
  const [customReasonText, setCustomReasonText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize form when targetEntry changes
  useEffect(() => {
    if (targetEntry) {
      const effective = targetEntry.effective_amount !== undefined ? targetEntry.effective_amount : targetEntry.amount;
      setCorrectAmountStr(Math.abs(effective).toString());
      setSelectedReason('Salah Harga');
      setCustomReasonText('');
      setError(null);
    }
  }, [targetEntry, open]);

  if (!targetEntry) return null;

  // Disallow correcting a correction
  if (targetEntry.type === 'koreksi') {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Tidak Dapat Dikoreksi</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error">
            Entri bertipe koreksi tidak dapat dikoreksi langsung. Silakan koreksi entri asli dari transaksi ini.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="contained">
            Tutup
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  const effectiveAmount = targetEntry.effective_amount !== undefined ? targetEntry.effective_amount : targetEntry.amount;
  const isTopup = targetEntry.type === 'topup';

  // Parse user entered correct amount
  const parsedTarget = parseInt(correctAmountStr.replace(/[^0-9]/g, ''), 10) || 0;
  // Signed target: titipan is negative debt, topup is positive credit
  const signedTarget = isTopup ? parsedTarget : -parsedTarget;
  // Delta needed = signedTarget - effectiveAmount
  const delta = signedTarget - effectiveAmount;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleQuickReasonClick = (reason: string) => {
    setSelectedReason(reason);
    if (reason === 'Batal') {
      setCorrectAmountStr('0');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const finalReason = selectedReason === 'Lainnya'
      ? customReasonText.trim()
      : selectedReason + (customReasonText.trim() ? `: ${customReasonText.trim()}` : '');

    if (!finalReason.trim()) {
      setError('Alasan koreksi wajib diisi.');
      return;
    }

    if (delta === 0) {
      setError('Nominal yang benar sama dengan nominal efektif saat ini. Tidak ada selisih koreksi.');
      return;
    }

    const clientId = uuidv4();
    setIsSubmitting(true);
    const now = new Date().toISOString();

    if (!isOnline) {
      // Offline mode: queue in IndexedDB
      try {
        const pendingItem = {
          client_id: clientId,
          wallet_id: walletId,
          type: 'koreksi' as const,
          amount: delta,
          target_amount: parsedTarget,
          final_nominal: parsedTarget,
          item_name: targetEntry.item_name,
          note: `Koreksi: ${finalReason}`,
          corrects_entry_id: targetEntry.id,
          correction_reason: finalReason,
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
          type: 'koreksi',
          amount: delta,
          item_name: targetEntry.item_name,
          note: `Koreksi: ${finalReason}`,
          corrects_entry_id: targetEntry.id,
          correction_reason: finalReason,
          occurred_at: now,
          created_by: 'me',
          created_at: now,
          created_by_username: 'Anda (Offline)',
          is_offline_pending: true,
        };

        onSuccess(mockEntry, true);
        handleClose();
      } catch {
        setError('Gagal menyimpan koreksi ke antrean offline.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Online mode: call API
    try {
      const res = await createEntryApi(walletId, {
        client_id: clientId,
        type: 'koreksi',
        amount: parsedTarget,
        target_amount: parsedTarget,
        final_nominal: parsedTarget,
        item_name: targetEntry.item_name,
        note: `Koreksi: ${finalReason}`,
        corrects_entry_id: targetEntry.id,
        correction_reason: finalReason,
        occurred_at: now,
      });

      onSuccess(res.entry, false);
      handleClose();
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 0) {
        // Fallback to offline queue on network drop
        const pendingItem = {
          client_id: clientId,
          wallet_id: walletId,
          type: 'koreksi' as const,
          amount: delta,
          target_amount: parsedTarget,
          final_nominal: parsedTarget,
          item_name: targetEntry.item_name,
          note: `Koreksi: ${finalReason}`,
          corrects_entry_id: targetEntry.id,
          correction_reason: finalReason,
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
          type: 'koreksi',
          amount: delta,
          item_name: targetEntry.item_name,
          note: `Koreksi: ${finalReason}`,
          corrects_entry_id: targetEntry.id,
          correction_reason: finalReason,
          occurred_at: now,
          created_by: 'me',
          created_at: now,
          created_by_username: 'Anda (Offline)',
          is_offline_pending: true,
        };

        onSuccess(mockEntry, true);
        handleClose();
      } else {
        setError(apiErr.message || 'Gagal menyimpan entri koreksi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Koreksi Transaksi
        </DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Original Entry Card */}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, mb: 2.5 }}>
            <Typography variant="caption" color="text.secondary">
              Entri Asli:
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {targetEntry.item_name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={`Tipe: ${targetEntry.type}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Nilai Asli: ${formatRupiah(targetEntry.amount)}`}
                size="small"
                variant="outlined"
              />
              {effectiveAmount !== targetEntry.amount && (
                <Chip
                  label={`Nilai Efektif Saat Ini: ${formatRupiah(effectiveAmount)}`}
                  size="small"
                  color="warning"
                />
              )}
            </Box>
          </Paper>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Correct Amount Input */}
            <TextField
              label="Nominal yang Benar"
              fullWidth
              required
              autoFocus
              placeholder="0"
              value={correctAmountStr}
              onChange={(e) => setCorrectAmountStr(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">Rp</InputAdornment>,
              }}
              helperText={
                parsedTarget === 0
                  ? 'Nominal 0 = Pembatalan transaksi (reversal penuh)'
                  : `Selisih koreksi yang akan dicatat di ledger: ${delta >= 0 ? '+' : ''}${formatRupiah(delta)}`
              }
            />

            {/* Quick Reason Selection */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
                Alasan Koreksi (Wajib):
              </Typography>
              <ButtonGroup size="small" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {QUICK_REASONS.map((r) => (
                  <Button
                    key={r}
                    variant={selectedReason === r ? 'contained' : 'outlined'}
                    color={r === 'Batal' ? 'error' : 'primary'}
                    onClick={() => handleQuickReasonClick(r)}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    {r}
                  </Button>
                ))}
              </ButtonGroup>
            </Box>

            {/* Additional note / custom reason text */}
            <TextField
              label={selectedReason === 'Lainnya' ? 'Ketik Alasan Koreksi' : 'Keterangan Tambahan (Opsional)'}
              fullWidth
              required={selectedReason === 'Lainnya'}
              placeholder="Contoh: Salah harga di struk / pesanan dibatalkan rekan"
              value={customReasonText}
              onChange={(e) => setCustomReasonText(e.target.value)}
            />

            {/* Summary preview */}
            <Alert severity={delta === 0 ? 'info' : 'warning'}>
              {delta === 0 ? (
                'Tidak ada perubahan nominal.'
              ) : (
                <>
                  Entri koreksi sebesar <strong>{delta >= 0 ? `+${formatRupiah(delta)}` : formatRupiah(delta)}</strong> akan ditambahkan ke buku ledger secara permanen. Nilai baru menjadi <strong>{formatRupiah(signedTarget)}</strong>.
                </>
              )}
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose} color="inherit" disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="warning"
            disabled={isSubmitting || delta === 0}
            sx={{ px: 3, fontWeight: 700 }}
          >
            {isSubmitting ? 'Menyimpan...' : 'Simpan Koreksi'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
