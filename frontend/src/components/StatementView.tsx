import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Chip,
  Box,
  IconButton,
  Tooltip,
  Pagination,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import { Entry } from '../types';
import { formatRupiah } from './BalanceCard';

interface StatementViewProps {
  entries: Entry[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onCorrectEntry: (entry: Entry) => void;
  onMoveEntry: (entry: Entry) => void;
  onDiscardFailedEntry?: (entry: Entry) => void;
  onMoveFailedEntry?: (entry: Entry) => void;
  onRetryFailedEntry?: (entry: Entry) => void;
  isArchivedWallet?: boolean;
}

export const StatementView: React.FC<StatementViewProps> = ({
  entries = [],
  totalCount = 0,
  page,
  pageSize,
  onPageChange,
  onCorrectEntry,
  onMoveEntry,
  onDiscardFailedEntry,
  onMoveFailedEntry,
  onRetryFailedEntry,
  isArchivedWallet,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const safeEntries = entries || [];
  const totalPages = Math.ceil((totalCount || 0) / (pageSize || 25)) || 1;

  // Compute effective amounts and corrections mapping
  const entriesWithEffective = useMemo(() => {
    const corrections: Record<string, Entry[]> = {};
    for (const e of safeEntries) {
      if (e.corrects_entry_id) {
        if (!corrections[e.corrects_entry_id]) {
          corrections[e.corrects_entry_id] = [];
        }
        corrections[e.corrects_entry_id].push(e);
      }
    }

    return safeEntries.map((e) => {
      const myCorrections = corrections[e.id] || [];
      const totalCorrectionDelta = myCorrections.reduce((sum, c) => sum + c.amount, 0);
      const effective =
        e.type !== 'koreksi' && myCorrections.length > 0
          ? e.amount + totalCorrectionDelta
          : e.amount;

      return {
        ...e,
        effective_amount: effective,
        has_corrections: myCorrections.length > 0,
        corrections_count: myCorrections.length,
      };
    });
  }, [safeEntries]);

  const getTypeChip = (e: Entry) => {
    if (e.is_offline_failed) {
      return (
        <Chip
          icon={<ErrorOutlineIcon />}
          label="Gagal Sinkron"
          size="small"
          color="error"
          variant="filled"
        />
      );
    }
    if (e.is_offline_pending) {
      return (
        <Chip
          icon={<CloudOffIcon />}
          label="Menunggu Sinkron"
          size="small"
          color="warning"
          variant="outlined"
        />
      );
    }

    switch (e.type) {
      case 'titipan':
        return <Chip label="Titipan" size="small" sx={{ bgcolor: '#ffebee', color: '#c62828', fontWeight: 600 }} />;
      case 'topup':
        return <Chip label="Top-up / Bayar" size="small" sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }} />;
      case 'koreksi':
        return <Chip label="Koreksi" size="small" sx={{ bgcolor: '#fff3e0', color: '#ef6c00', fontWeight: 600 }} />;
      default:
        return <Chip label={e.type} size="small" />;
    }
  };

  const renderActions = (e: Entry & { has_corrections?: boolean }) => {
    const isCorrectionType = e.type === 'koreksi';
    const isActionDisabled = Boolean(e.is_offline_pending || isCorrectionType || isArchivedWallet);

    if (e.is_offline_failed) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
          <Tooltip title="Coba Sinkronkan Ulang">
            <IconButton size="small" color="primary" onClick={() => onRetryFailedEntry?.(e)}>
              <ReplayIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Pindahkan ke Buku Lain">
            <IconButton size="small" color="warning" onClick={() => onMoveFailedEntry?.(e)}>
              <SwapHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Buang / Hapus Entri Gagal">
            <IconButton size="small" color="error" onClick={() => onDiscardFailedEntry?.(e)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
        <Tooltip
          title={
            isCorrectionType
              ? 'Entri koreksi tidak dapat dikoreksi ulang'
              : e.is_offline_pending
              ? 'Tunggu sinkronisasi selesai'
              : 'Koreksi Entri'
          }
        >
          <span>
            <IconButton size="small" disabled={isActionDisabled} onClick={() => onCorrectEntry(e)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip
          title={
            isCorrectionType
              ? 'Entri koreksi tidak dapat dipindah'
              : e.is_offline_pending
              ? 'Tunggu sinkronisasi selesai'
              : 'Pindah ke Buku Lain'
          }
        >
          <span>
            <IconButton size="small" disabled={isActionDisabled} onClick={() => onMoveEntry(e)}>
              <SwapHorizIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    );
  };
  const renderAmount = (e: Entry & { effective_amount?: number; has_corrections?: boolean }) => {
    const isCorrected = Boolean(e.has_corrections);
    if (isCorrected) {
      return (
        <Box>
          <Typography
            variant="caption"
            sx={{ textDecoration: 'line-through', color: 'text.secondary', display: 'block' }}
          >
            {e.amount > 0 ? `+${formatRupiah(e.amount)}` : formatRupiah(e.amount)}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 700, color: (e.effective_amount || 0) < 0 ? '#d32f2f' : '#2e7d32' }}
          >
            {(e.effective_amount || 0) > 0
              ? `+${formatRupiah(e.effective_amount || 0)}`
              : formatRupiah(e.effective_amount || 0)}
          </Typography>
        </Box>
      );
    }
    return (
      <Typography variant="body2" sx={{ fontWeight: 700, color: e.amount < 0 ? '#d32f2f' : '#2e7d32' }}>
        {e.amount > 0 ? `+${formatRupiah(e.amount)}` : formatRupiah(e.amount)}
      </Typography>
    );
  };

  if (isMobile) {
    return (
      <Paper elevation={1} sx={{ borderRadius: 2 }}>
        {entriesWithEffective.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Belum ada transaksi di buku ledger ini.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 1.5 }}>
            {entriesWithEffective.map((e) => (
              <Paper
                key={e.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  mb: 1.5,
                  borderRadius: 2,
                  bgcolor: e.is_offline_failed ? '#fff5f5' : 'inherit',
                  opacity: e.is_offline_pending ? 0.75 : 1,
                  '&:last-of-type': { mb: 0 },
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                  {getTypeChip(e)}
                  <Box sx={{ textAlign: 'right' }}>{renderAmount(e)}</Box>
                </Box>

                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {e.item_name}
                </Typography>
                {e.note && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {e.note}
                  </Typography>
                )}
                {e.corrects_entry_id && (
                  <Typography variant="caption" color="warning.main" display="block">
                    Koreksi entri: {e.corrects_entry_id.substring(0, 8)}... {e.correction_reason ? `(${e.correction_reason})` : ''}
                  </Typography>
                )}
                {Boolean(e.has_corrections) && (
                  <Chip
                    label={`Ada ${e.corrections_count} koreksi`}
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ mt: 0.5, height: 20, fontSize: '0.7rem' }}
                  />
                )}
                {e.offline_error && (
                  <Typography variant="caption" color="error" display="block" sx={{ fontWeight: 600 }}>
                    Alasan Ditolak: {e.offline_error}
                  </Typography>
                )}

                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mt: 1,
                    pt: 1,
                    borderTop: '1px solid #eee',
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {new Date(e.occurred_at || e.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {e.created_by_username || 'System'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Saldo: {e.running_balance !== undefined ? formatRupiah(e.running_balance) : '-'}
                    </Typography>
                  </Box>
                  {!isArchivedWallet && renderActions(e)}
                </Box>
              </Paper>
            ))}
          </Box>
        )}

        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <Pagination count={totalPages} page={page} onChange={(_, val) => onPageChange(val)} color="primary" size="small" />
          </Box>
        )}
      </Paper>
    );
  }

  return (
    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <TableContainer>
        <Table sx={{ minWidth: 650 }}>
          <TableHead sx={{ bgcolor: '#f1f5f9' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Waktu</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Tipe</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Barang / Keperluan</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Nominal</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Saldo Berjalan</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Pencatat</TableCell>
              {!isArchivedWallet && (
                <TableCell align="center" sx={{ fontWeight: 700 }}>Aksi</TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {entriesWithEffective.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isArchivedWallet ? 6 : 7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Belum ada transaksi di buku ledger ini.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              entriesWithEffective.map((e) => (
                <TableRow
                  key={e.id}
                  hover
                  sx={{
                    bgcolor: e.is_offline_failed ? '#fff5f5' : 'inherit',
                    opacity: e.is_offline_pending ? 0.75 : 1,
                  }}
                >
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(e.occurred_at || e.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {getTypeChip(e)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {e.item_name}
                    </Typography>
                    {e.note && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {e.note}
                      </Typography>
                    )}
                    {e.corrects_entry_id && (
                      <Typography variant="caption" color="warning.main" display="block">
                        Koreksi entri: {e.corrects_entry_id.substring(0, 8)}... {e.correction_reason ? `(${e.correction_reason})` : ''}
                      </Typography>
                    )}
                    {Boolean(e.has_corrections) && (
                      <Chip
                        label={`Ada ${e.corrections_count} koreksi`}
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ mt: 0.5, height: 20, fontSize: '0.7rem' }}
                      />
                    )}
                    {e.offline_error && (
                      <Typography variant="caption" color="error" display="block" sx={{ fontWeight: 600 }}>
                        Alasan Ditolak: {e.offline_error}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{renderAmount(e)}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {e.running_balance !== undefined ? formatRupiah(e.running_balance) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {e.created_by_username || 'System'}
                    </Typography>
                  </TableCell>
                  {!isArchivedWallet && <TableCell align="center">{renderActions(e)}</TableCell>}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, val) => onPageChange(val)}
            color="primary"
          />
        </Box>
      )}
    </Paper>
  );
};
