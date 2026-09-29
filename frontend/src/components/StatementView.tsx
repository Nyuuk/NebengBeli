import React from 'react';
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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CloudOffIcon from '@mui/icons-material/CloudOff';
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
  isArchivedWallet,
}) => {
  const safeEntries = entries || [];
  const totalPages = Math.ceil((totalCount || 0) / (pageSize || 25)) || 1;

  const getTypeChip = (type: string, isOffline?: boolean) => {
    if (isOffline) {
      return (
        <Chip
          icon={<CloudOffIcon />}
          label="Offline (Antrean)"
          size="small"
          color="warning"
          variant="outlined"
        />
      );
    }

    switch (type) {
      case 'titipan':
        return <Chip label="Titipan" size="small" sx={{ bgcolor: '#ffebee', color: '#c62828', fontWeight: 600 }} />;
      case 'topup':
        return <Chip label="Topup / Bayar" size="small" sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }} />;
      case 'koreksi':
        return <Chip label="Koreksi" size="small" sx={{ bgcolor: '#fff3e0', color: '#ef6c00', fontWeight: 600 }} />;
      default:
        return <Chip label={type} size="small" />;
    }
  };

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
            {safeEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isArchivedWallet ? 6 : 7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Belum ada transaksi di buku ledger ini.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              safeEntries.map((e) => (
                <TableRow key={e.id} hover sx={{ opacity: e.is_offline_pending ? 0.75 : 1 }}>
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
                    {getTypeChip(e.type, e.is_offline_pending)}
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
                        Ref Koreksi: {e.corrects_entry_id.substring(0, 8)}... {e.correction_reason ? `(${e.correction_reason})` : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        color: e.amount > 0 ? '#d32f2f' : '#2e7d32',
                      }}
                    >
                      {e.amount > 0 ? `+${formatRupiah(e.amount)}` : formatRupiah(e.amount)}
                    </Typography>
                  </TableCell>
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
                  {!isArchivedWallet && (
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                        <Tooltip title={e.type === 'koreksi' ? 'Entri koreksi tidak dapat dikoreksi ulang' : 'Koreksi Entri'}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={Boolean(e.is_offline_pending || e.type === 'koreksi')}
                              onClick={() => onCorrectEntry(e)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={e.type === 'koreksi' ? 'Entri koreksi tidak dapat dipindah' : 'Pindah ke Wallet Lain'}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={Boolean(e.is_offline_pending || e.type === 'koreksi')}
                              onClick={() => onMoveEntry(e)}
                            >
                              <SwapHorizIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  )}
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
