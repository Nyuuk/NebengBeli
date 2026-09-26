import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Layout } from '../components/Layout';
import {
  listLinkRequestsApi,
  approveLinkRequestApi,
  rejectLinkRequestApi,
} from '../api/linkRequests';
import { useAuth } from '../context/AuthContext';
import { LinkRequest } from '../types';

export const LinkRequestsPage: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listLinkRequestsApi();
      setRequests(list);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat daftar permintaan tautan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (id: string) => {
    try {
      await approveLinkRequestApi(id);
      setMessage('Permintaan berhasil disetujui! Buku sekarang tertaut.');
      fetchRequests();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal menyetujui permintaan.');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectLinkRequestApi(id);
      setMessage('Permintaan tautan ditolak.');
      fetchRequests();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal menolak permintaan.');
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'pending':
        return <Chip label="Menunggu" size="small" color="warning" variant="outlined" />;
      case 'approved':
        return <Chip label="Disetujui" size="small" color="success" />;
      case 'rejected':
        return <Chip label="Ditolak" size="small" color="error" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  return (
    <Layout>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Kelola Permintaan Tautan Wallet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Daftar permintaan masuk dan keluar untuk berbagi kepemilikan buku titipan
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {message && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Waktu Dibuat</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Nama Buku</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Peminta</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Target Rekan</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Waktu Keputusan</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Aksi</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        Belum ada riwayat permintaan tautan masuk atau keluar.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((r) => {
                    const isTarget = user && user.id === r.target_user_id;
                    const canRespond = isTarget && r.status === 'pending';

                    return (
                      <TableRow key={r.id} hover>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(r.created_at).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {r.wallet_name}
                          </Typography>
                        </TableCell>
                        <TableCell>{r.requested_by_username || r.requested_by}</TableCell>
                        <TableCell>{r.target_username || r.target_user_id}</TableCell>
                        <TableCell>{getStatusChip(r.status)}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {r.decided_at ? new Date(r.decided_at).toLocaleString('id-ID') : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {canRespond ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                startIcon={<CheckIcon />}
                                onClick={() => handleApprove(r.id)}
                              >
                                Setujui
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<CloseIcon />}
                                onClick={() => handleReject(r.id)}
                              >
                                Tolak
                              </Button>
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              -
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Layout>
  );
};
