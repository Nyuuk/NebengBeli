import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Grid,
  Card,
  CardActionArea,
  Button,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArchiveIcon from '@mui/icons-material/Archive';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { formatRupiah } from '../components/BalanceCard';
import { createWalletApi, getWalletsApi } from '../api/wallets';
import { listLinkRequestsApi } from '../api/linkRequests';
import { Wallet } from '../types';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<number>(0); // 0 = Active, 1 = Archived
  const [openCreate, setOpenCreate] = useState<boolean>(false);
  const [newWalletName, setNewWalletName] = useState<string>('');
  const [targetUsername, setTargetUsername] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchWallets = useCallback(async () => {
    try {
      setLoading(true);
      const [list, linkRequests] = await Promise.all([
        getWalletsApi(tab === 1),
        listLinkRequestsApi().catch(() => []),
      ]);
      setWallets(list);
      const pending = linkRequests.filter((r) => r.status === 'pending');
      setPendingRequestsCount(pending.length);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat daftar wallet.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWalletName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createWalletApi(newWalletName.trim(), targetUsername.trim());
      setOpenCreate(false);
      setNewWalletName('');
      setTargetUsername('');
      navigate(`/wallets/${created.id}`);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal membuat wallet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalOutstanding = wallets.reduce((acc, w) => acc + (w.is_archived ? 0 : w.balance), 0);

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Buku Ledger Titipan
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Kelola pencatatan titipan belanja dan pembayaran bersama teman
          </Typography>
          {wallets.length > 0 && tab === 0 && (
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block', fontWeight: 600, color: totalOutstanding > 0 ? '#d32f2f' : '#2e7d32' }}>
              Total Piutang/Hutang Keseluruhan: {formatRupiah(totalOutstanding)}
            </Typography>
          )}
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenCreate(true)}
          sx={{ fontWeight: 700, px: 2.5, py: 1 }}
        >
          Buat Buku Baru
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {pendingRequestsCount > 0 && (
        <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: '#e3f2fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <LinkIcon color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Anda memiliki {pendingRequestsCount} permintaan tautan wallet yang belum disetujui.
            </Typography>
          </Box>
          <Button variant="outlined" size="small" onClick={() => navigate('/links')}>
            Lihat Permintaan
          </Button>
        </Paper>
      )}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab label={`Buku Aktif (${tab === 0 ? wallets.length : '...'})`} />
          <Tab label="Diarsipkan" icon={<ArchiveIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Wallets Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : wallets.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 2 }}>
          <AccountBalanceWalletIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {tab === 0 ? 'Belum Ada Buku Titipan' : 'Tidak Ada Buku yang Diarsipkan'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tab === 0
              ? 'Mulai buat buku baru untuk mencatat titipan teman.'
              : 'Buku yang telah diselesaikan dan diarsipkan akan muncul di sini.'}
          </Typography>
          {tab === 0 && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenCreate(true)}>
              Buat Buku Sekarang
            </Button>
          )}
        </Paper>
      ) : (
        <Grid container spacing={2.5}>
          {wallets.map((w) => (
            <Grid item xs={12} sm={6} md={4} key={w.id}>
              <Card
                elevation={1}
                sx={{
                  borderRadius: 2.5,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.15s ease-in-out, box-shadow 0.15s',
                  '&:hover': {
                    transform: 'translateY(-3px)',
                    boxShadow: 4,
                  },
                }}
              >
                <CardActionArea
                  onClick={() => navigate(`/wallets/${w.id}`)}
                  sx={{ p: 2.5, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between' }}
                >
                  <Box sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                        {w.name}
                      </Typography>
                      <Chip
                        label={w.user_role === 'creator' ? 'Pembuat' : w.user_role === 'owner' ? 'Pemilik' : 'Penuh'}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Box>

                    <Typography variant="caption" color="text.secondary" display="block">
                      Pembuat: {w.creator_username} {w.owner_username ? `• Rekan: ${w.owner_username}` : '• (Belum ditautkan)'}
                    </Typography>
                  </Box>

                  <Box sx={{ width: '100%', mt: 3, pt: 2, borderTop: '1px solid #eee' }}>
                    <Typography variant="caption" color="text.secondary">
                      Status Saldo
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 800,
                        color: w.balance > 0 ? '#d32f2f' : w.balance < 0 ? '#0288d1' : '#2e7d32',
                      }}
                    >
                      {formatRupiah(w.balance)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {w.entry_count} total transaksi tercatat
                    </Typography>
                  </Box>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Wallet Dialog */}
      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleCreateWallet}>
          <DialogTitle sx={{ fontWeight: 700 }}>Buat Buku Titipan Baru</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Nama Buku / Nama Teman"
                fullWidth
                required
                autoFocus
                placeholder="Contoh: Titipan Makan Siang Kantor / Budi"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
              />

              <TextField
                label="Tautkan ke Username Teman (Opsional)"
                fullWidth
                placeholder="Contoh: budi_santoso"
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                helperText="Bisa juga dibuat sekarang dan ditautkan nanti via menu tautan."
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenCreate(false)} color="inherit" disabled={isSubmitting}>
              Batal
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || !newWalletName.trim()}
              sx={{ px: 3, fontWeight: 600 }}
            >
              {isSubmitting ? 'Membuat...' : 'Buat Buku'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Layout>
  );
};
