import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  TextField,
  Alert,
  Snackbar,
  Paper,
  Chip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { Entry, Wallet, RecapPeriod } from '../types';
import { formatRupiah } from './BalanceCard';

interface RekapTextModalProps {
  open: boolean;
  wallet: Wallet;
  entries: Entry[];
  onClose: () => void;
}

export function generateRekapText(
  wallet: Wallet,
  entries: Entry[],
  period: RecapPeriod,
  customStart?: string,
  customEnd?: string
): {
  rekapText: string;
  hasOfflineEntries: boolean;
  startingBalance: number;
  endingBalance: number;
  periodLabel: string;
  filteredEntries: Entry[];
  totalDelta: number;
} {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let periodLabel = 'Hari Ini';

  if (period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    periodLabel = `Hari Ini (${now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })})`;
  } else if (period === 'this_week') {
    // Start from Monday
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff, 0, 0, 0, 0);
    periodLabel = `Minggu Ini (${startDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} - ${now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })})`;
  } else if (period === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    periodLabel = `Bulan Ini (${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })})`;
  } else {
    startDate = customStart ? new Date(customStart + 'T00:00:00') : new Date(0);
    endDate = customEnd ? new Date(customEnd + 'T23:59:59') : new Date();
    periodLabel = `Periode Custom (${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')})`;
  }

  // Sort chronological
  const sorted = [...entries].sort((a, b) => {
    const timeA = new Date(a.occurred_at || a.created_at).getTime();
    const timeB = new Date(b.occurred_at || b.created_at).getTime();
    return timeA - timeB;
  });

  let startingBalance = 0;
  const filteredEntries: Entry[] = [];
  let hasOfflineEntries = false;

  for (const entry of sorted) {
    const entryTime = new Date(entry.occurred_at || entry.created_at);
    if (entryTime < startDate) {
      startingBalance += entry.amount;
    } else if (entryTime <= endDate) {
      filteredEntries.push(entry);
      if (entry.is_offline_pending) {
        hasOfflineEntries = true;
      }
    }
  }

  const totalDelta = filteredEntries.reduce((acc, e) => acc + e.amount, 0);
  const endingBalance = startingBalance + totalDelta;

  const lines: string[] = [];
  lines.push(`📋 REKAP BUKU TITIPAN — ${wallet.name.toUpperCase()}`);
  lines.push(`👤 Pembuat: ${wallet.creator_username || 'OB/GA'}${wallet.owner_username ? ` | Rekan: ${wallet.owner_username}` : ''}`);
  lines.push(`📅 Periode: ${periodLabel}`);
  lines.push('');
  lines.push(`💰 Saldo Awal: ${formatRupiah(startingBalance)}`);
  lines.push('────────────────────────');
  lines.push('📝 Rincian Transaksi:');

  if (filteredEntries.length === 0) {
    lines.push('  (Tidak ada transaksi pada periode ini)');
  } else {
    filteredEntries.forEach((e, idx) => {
      const dt = new Date(e.occurred_at || e.created_at);
      const timeStr = dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const dateStr = dt.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
      let typeStr = 'Titipan';
      let sign = '+';
      if (e.type === 'topup') {
        typeStr = 'Top-up/Bayar';
        sign = '-';
      } else if (e.type === 'koreksi') {
        typeStr = 'Koreksi';
        sign = e.amount >= 0 ? '+' : '-';
      }

      const noteStr = e.note ? ` (${e.note})` : '';
      const offlineMark = e.is_offline_pending ? ' [Pending Offline]' : '';
      lines.push(
        `${idx + 1}. [${dateStr} ${timeStr}] ${e.item_name}${noteStr}`
      );
      lines.push(`   └ ${typeStr}: ${sign}${formatRupiah(Math.abs(e.amount))}${offlineMark}`);
    });
  }

  lines.push('────────────────────────');
  lines.push(`📊 Total Transaksi Periode Ini: ${totalDelta >= 0 ? '+' : ''}${formatRupiah(totalDelta)}`);
  lines.push(`🎯 Saldo Akhir: ${formatRupiah(endingBalance)} ${endingBalance > 0 ? '(Tagihan Belum Lunas)' : endingBalance < 0 ? '(Kelebihan Bayar)' : '(Lunas)'}`);
  lines.push('');
  lines.push(`🕒 Dicetak pada: ${new Date().toLocaleString('id-ID')}`);
  lines.push('Aplikasi NebengBeli');

  return {
    rekapText: lines.join('\n'),
    hasOfflineEntries,
    startingBalance,
    endingBalance,
    periodLabel,
    filteredEntries,
    totalDelta,
  };
}

export const RekapTextModal: React.FC<RekapTextModalProps> = ({
  open,
  wallet,
  entries,
  onClose,
}) => {
  const [period, setPeriod] = useState<RecapPeriod>('today');
  const [customStart, setCustomStart] = useState<string>(
    new Date().toISOString().substring(0, 10)
  );
  const [customEnd, setCustomEnd] = useState<string>(
    new Date().toISOString().substring(0, 10)
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { rekapText, hasOfflineEntries, startingBalance, endingBalance, filteredEntries, totalDelta } =
    useMemo(() => {
      return generateRekapText(wallet, entries, period, customStart, customEnd);
    }, [wallet, entries, period, customStart, customEnd]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rekapText);
      setToastMessage('Teks rekap berhasil disalin ke clipboard!');
    } catch {
      setToastMessage('Gagal menyalin otomatis, silakan blok dan salin teks secara manual.');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Rekap NebengBeli - ${wallet.name}`,
          text: rekapText,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        Buat Rekap Teks (WhatsApp / Telegram)
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <Tabs
            value={period === 'custom' ? 3 : period === 'this_month' ? 2 : period === 'this_week' ? 1 : 0}
            onChange={(_, val) => {
              if (val === 0) setPeriod('today');
              if (val === 1) setPeriod('this_week');
              if (val === 2) setPeriod('this_month');
              if (val === 3) setPeriod('custom');
            }}
            variant="fullWidth"
          >
            <Tab label="Hari Ini" />
            <Tab label="Minggu Ini" />
            <Tab label="Bulan Ini" />
            <Tab label="Custom" />
          </Tabs>
        </Box>

        {period === 'custom' && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Tanggal Mulai"
              type="date"
              fullWidth
              size="small"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Tanggal Selesai"
              type="date"
              fullWidth
              size="small"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        )}

        {hasOfflineEntries && (
          <Alert severity="warning" icon={<CloudOffIcon />} sx={{ mb: 2 }}>
            Peringatan: Rekap ini mencakup entri yang belum tersinkronisasi ke server.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Chip label={`Saldo Awal: ${formatRupiah(startingBalance)}`} size="small" variant="outlined" />
          <Chip
            label={`Transaksi: ${filteredEntries.length} entri (${totalDelta >= 0 ? '+' : ''}${formatRupiah(totalDelta)})`}
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label={`Saldo Akhir: ${formatRupiah(endingBalance)}`}
            size="small"
            color={endingBalance > 0 ? 'error' : 'success'}
          />
        </Box>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: '#f8fafc',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            whiteSpace: 'pre-wrap',
            maxHeight: 320,
            overflowY: 'auto',
            borderRadius: 2,
          }}
        >
          {rekapText}
        </Paper>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose} color="inherit">
          Tutup
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<ShareIcon />}
            onClick={handleShare}
          >
            Bagikan
          </Button>
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            sx={{ fontWeight: 700 }}
          >
            Salin Teks
          </Button>
        </Box>
      </DialogActions>

      <Snackbar
        open={Boolean(toastMessage)}
        autoHideDuration={3000}
        onClose={() => setToastMessage(null)}
        message={toastMessage}
      />
    </Dialog>
  );
};
