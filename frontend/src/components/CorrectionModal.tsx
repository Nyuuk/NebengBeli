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
  InputAdornment,
  InputLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { createEntryApi } from '../api/entries';
import { formatRupiah } from './BalanceCard';
import { Entry } from '../types';

interface CorrectionModalProps {
  open: boolean;
  walletId: string;
  targetEntry: Entry | null;
  onClose: () => void;
  onSuccess: (entry: Entry) => void;
}

export const CorrectionModal: React.FC<CorrectionModalProps> = ({
  open,
  walletId,
  targetEntry,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'reverse' | 'custom'>('reverse');
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [sign, setSign] = useState<'negative' | 'positive'>('negative');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!targetEntry) return null;

  const handleClose = () => {
    setError(null);
    setReason('');
    setCustomAmountStr('');
    setMode('reverse');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError('Alasan koreksi harus diisi.');
      return;
    }

    let correctionAmount = 0;
    if (mode === 'reverse') {
      // Reversal: exactly negate the target entry amount
      correctionAmount = -targetEntry.amount;
    } else {
      const parsed = parseInt(customAmountStr.replace(/[^0-9]/g, ''), 10);
      if (isNaN(parsed) || parsed === 0) {
        setError('Nominal penyesuaian harus valid.');
        return;
      }
      correctionAmount = sign === 'negative' ? -parsed : parsed;
    }

    setIsSubmitting(true);
    try {
      const clientId = uuidv4();
      const res = await createEntryApi(walletId, {
        client_id: clientId,
        type: 'koreksi',
        amount: correctionAmount,
        item_name: targetEntry.item_name,
        note: `Koreksi: ${reason.trim()}`,
        corrects_entry_id: targetEntry.id,
        correction_reason: reason.trim(),
        occurred_at: new Date().toISOString(),
      });

      onSuccess(res.entry);
      handleClose();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal menyimpan entri koreksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Koreksi Entri Ledger
        </DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 2, mb: 2.5 }}>
            <Typography variant="caption" color="text.secondary">
              Entri yang Dikoreksi:
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
              Nominal: {formatRupiah(targetEntry.amount)} ({targetEntry.type})
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Ref ID: {targetEntry.id}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <FormControl>
              <FormLabel id="correction-mode-label">Metode Koreksi</FormLabel>
              <RadioGroup
                value={mode}
                onChange={(e) => setMode(e.target.value as 'reverse' | 'custom')}
              >
                <FormControlLabel
                  value="reverse"
                  control={<Radio />}
                  label={`Batalkan / Balikkan Total (${formatRupiah(-targetEntry.amount)})`}
                />
                <FormControlLabel
                  value="custom"
                  control={<Radio />}
                  label="Penyesuaian Nominal Sebagian (Custom Adjustment)"
                />
              </RadioGroup>
            </FormControl>

            {mode === 'custom' && (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl sx={{ minWidth: 140 }}>
                  <InputLabel id="sign-label">Arah Koreksi</InputLabel>
                  <RadioGroup
                    value={sign}
                    onChange={(e) => setSign(e.target.value as 'negative' | 'positive')}
                  >
                    <FormControlLabel value="negative" control={<Radio size="small" />} label="Kurangi (-)" />
                    <FormControlLabel value="positive" control={<Radio size="small" />} label="Tambah (+)" />
                  </RadioGroup>
                </FormControl>

                <TextField
                  label="Nominal Koreksi"
                  fullWidth
                  required
                  placeholder="Contoh: 10.000"
                  value={customAmountStr}
                  onChange={(e) => setCustomAmountStr(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">Rp</InputAdornment>,
                  }}
                />
              </Box>
            )}

            <TextField
              label="Alasan Koreksi"
              fullWidth
              required
              multiline
              rows={2}
              placeholder="Contoh: Salah input harga atau barang tidak jadi dibeli"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
            color="warning"
            disabled={isSubmitting}
            sx={{ px: 3, fontWeight: 600 }}
          >
            {isSubmitting ? 'Memproses...' : 'Terapkan Koreksi'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
