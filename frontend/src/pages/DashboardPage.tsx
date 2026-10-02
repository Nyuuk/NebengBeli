import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  IconButton,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import LinkIcon from '@mui/icons-material/Link';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArchiveIcon from '@mui/icons-material/Archive';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import { useNavigate } from 'react-router-dom';

import { Layout } from '../components/Layout';
import { formatRupiah } from '../components/BalanceCard';
import { CreatorInsightsCard } from '../components/CreatorInsightsCard';
import { ShoppingSessionModal } from '../components/ShoppingSessionModal';

import { createWalletApi, getWalletsApi, getCreatorInsightsApi } from '../api/wallets';
import { listLinkRequestsApi } from '../api/linkRequests';
import {
  setCachedWallets,
  getCachedWallets,
  setCachedInsights,
  getCachedInsights,
} from '../offline/db';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../context/OnlineStatusContext';
import { Wallet, CreatorInsights } from '../types';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [insights, setInsights] = useState<CreatorInsights | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<number>(0); // 0 = Dompet Kelolaan (Creator), 1 = Dompet Milik Saya (Owner), 2 = Diarsipkan

  // Modals
  const [openCreate, setOpenCreate] = useState<boolean>(false);
  const [openShoppingSession, setOpenShoppingSession] = useState<boolean>(false);
  const [newWalletName, setNewWalletName] = useState<string>('');
  const [targetUsername, setTargetUsername] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (isOnline) {
        // Online: Fetch fresh data from APIs
        // getWalletsApi(true) already returns active + archived wallets (archived=true
        // means "include archived", not "archived only"), so a single call covers both;
        // calling it alongside getWalletsApi(false) would double every active wallet.
        const [allWallets, linkRequests, insightsData] = await Promise.all([
          getWalletsApi(true).catch(() => []),
          listLinkRequestsApi().catch(() => []),
          getCreatorInsightsApi().catch(() => null),
        ]);

        setWallets(allWallets);
        await setCachedWallets(allWallets, 'all');

        const pending = (linkRequests || []).filter((r) => r.status === 'pending');
        setPendingRequestsCount(pending.length);

        if (insightsData) {
          setInsights(insightsData);
          await setCachedInsights(insightsData);
        } else {
          // Compute fallback insights from active creator wallets
          const creatorWallets = allWallets.filter((w) => !w.is_archived && (w.user_role === 'creator' || w.user_role === 'both' || !w.user_role));
          const moneyOutside = creatorWallets.reduce((sum, w) => sum + (w.balance < 0 ? -w.balance : 0), 0);
          const fallbackInsights: CreatorInsights = {
            total_money_outside: moneyOutside,
            active_wallets_count: creatorWallets.length,
            total_wallets_count: allWallets.length,
            total_titipan_volume: creatorWallets.reduce((sum, w) => sum + (w.balance < 0 ? -w.balance : 0), 0),
            total_titipan_count: creatorWallets.reduce((sum, w) => sum + w.entry_count, 0),
            daily_trends: [],
            weekly_trends: [],
            monthly_trends: [],
            wallet_balances: creatorWallets.map((w) => ({
              wallet_id: w.id,
              wallet_name: w.name,
              balance: w.balance,
              owner_username: w.owner_username,
              is_archived: w.is_archived,
            })),
            cached_at: new Date().toISOString(),
          };
          setInsights(fallbackInsights);
          await setCachedInsights(fallbackInsights);
        }

        setLastSyncedAt(new Date().toISOString());
      } else {
        // Offline: Load from IndexedDB cache
        const cachedWalletsRecord = await getCachedWallets('all');
        if (cachedWalletsRecord) {
          setWallets(cachedWalletsRecord.wallets);
          setLastSyncedAt(cachedWalletsRecord.cached_at);
        }

        const cachedInsightsRecord = await getCachedInsights();
        if (cachedInsightsRecord) {
          setInsights(cachedInsightsRecord.data);
        }
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat data buku titipan.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Foreground auto-refresh & global sync listener
  useEffect(() => {
    const handleForeground = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData();
      }
    };

    const handleSynced = () => {
      fetchDashboardData();
    };

    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('focus', handleForeground);
    window.addEventListener('nebengbeli:synced', handleSynced);

    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('focus', handleForeground);
      window.removeEventListener('nebengbeli:synced', handleSynced);
    };
  }, [fetchDashboardData]);

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
      setError(apiErr.message || 'Gagal membuat buku titipan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter wallets into creator, owner, and archived lists
  const currentUserId = user?.id;

  const creatorWallets = useMemo(() => {
    return wallets.filter((w) => !w.is_archived && (w.creator_id === currentUserId || w.user_role === 'creator' || w.user_role === 'both' || !w.user_role));
  }, [wallets, currentUserId]);

  const ownerWallets = useMemo(() => {
    return wallets.filter((w) => !w.is_archived && (w.owner_id === currentUserId || w.user_role === 'owner'));
  }, [wallets, currentUserId]);

  const archivedWallets = useMemo(() => {
    return wallets.filter((w) => w.is_archived);
  }, [wallets]);

  // Group owner wallets per creator with subtotals
  const ownerWalletsByCreator = useMemo(() => {
    const groups: Record<string, { creator_username: string; wallets: Wallet[]; subtotal: number }> = {};

    for (const w of ownerWallets) {
      const creatorKey = w.creator_username || w.creator_id || 'Unknown';
      if (!groups[creatorKey]) {
        groups[creatorKey] = {
          creator_username: w.creator_username || 'OB / Rekan',
          wallets: [],
          subtotal: 0,
        };
      }
      groups[creatorKey].wallets.push(w);
      groups[creatorKey].subtotal += w.balance || 0;
    }

    return Object.values(groups);
  }, [ownerWallets]);

  return (
    <Layout>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
            Buku Ledger Titipan
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pencatatan titipan jajan cepat, rekap transparan, dan saldo akurat
          </Typography>
          {lastSyncedAt && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
              <CloudDoneIcon fontSize="inherit" color="action" /> Terakhir disinkron: {new Date(lastSyncedAt).toLocaleString('id-ID')}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Tooltip title="Muat ulang data">
            <IconButton onClick={fetchDashboardData} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            color="primary"
            startIcon={<ShoppingBagIcon />}
            onClick={() => setOpenShoppingSession(true)}
            sx={{ fontWeight: 700, px: 2, py: 1 }}
          >
            Sesi Belanja
          </Button>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenCreate(true)}
            sx={{ fontWeight: 700, px: 2.5, py: 1 }}
          >
            Buat Buku Baru
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {pendingRequestsCount > 0 && (
        <Paper
          elevation={1}
          sx={{
            p: 2,
            mb: 3,
            borderRadius: 2,
            bgcolor: '#e3f2fd',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <LinkIcon color="primary" />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Anda memiliki {pendingRequestsCount} permintaan tautan buku yang belum disetujui.
            </Typography>
          </Box>
          <Button variant="outlined" size="small" onClick={() => navigate('/links')}>
            Lihat Undangan
          </Button>
        </Paper>
      )}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab label={`Dompet Saya Kelola (${creatorWallets.length})`} />
          <Tab label={`Dompet Milik Saya (${ownerWallets.length})`} />
          <Tab label={`Diarsipkan (${archivedWallets.length})`} icon={<ArchiveIcon fontSize="small" />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab 0: Dompet yang Saya Kelola (Pembuat) */}
      {tab === 0 && (
        <>
          {insights && insights.active_wallets_count > 0 && (
            <CreatorInsightsCard
              insights={insights}
              onWalletClick={(wId) => navigate(`/wallets/${wId}`)}
            />
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : creatorWallets.length === 0 ? (
            <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 2 }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Belum Ada Buku Titipan yang Anda Kelola
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                Mulai buat buku titipan untuk mencatat talangan belanja rekan kerja.
              </Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenCreate(true)}>
                Buat Buku Sekarang
              </Button>
            </Paper>
          ) : (
            <Grid container spacing={2.5}>
              {creatorWallets.map((w) => (
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
                            label="Pembuat"
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        </Box>

                        <Typography variant="caption" color="text.secondary" display="block">
                          {w.owner_username ? `Rekan: @${w.owner_username}` : '(Belum tertaut)'}
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
                            color: w.balance < 0 ? '#d32f2f' : w.balance > 0 ? '#0288d1' : '#2e7d32',
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
        </>
      )}

      {/* Tab 1: Dompet Milik Saya (Penitip) Grouped by Creator */}
      {tab === 1 && (
        <>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : ownerWalletsByCreator.length === 0 ? (
            <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 2 }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Belum Ada Buku Titipan Milik Anda
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Buku yang ditautkan oleh pembuat titipan (OB/rekan) akan muncul di sini setelah Anda menyetujui undangannya.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
              {ownerWalletsByCreator.map((group) => (
                <Box key={group.creator_username}>
                  <Box
                    sx={{
                      p: 2,
                      mb: 2,
                      borderRadius: 2,
                      bgcolor: '#f1f5f9',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Pembuat: @{group.creator_username}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {group.wallets.length} buku titipan dikelola oleh rekan ini
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Subtotal Saldo
                      </Typography>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 800,
                          color: group.subtotal < 0 ? '#d32f2f' : group.subtotal > 0 ? '#0288d1' : '#2e7d32',
                        }}
                      >
                        {formatRupiah(group.subtotal)}
                      </Typography>
                    </Box>
                  </Box>

                  <Grid container spacing={2.5}>
                    {group.wallets.map((w) => (
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
                                  label="Pemilik"
                                  size="small"
                                  color="secondary"
                                  variant="outlined"
                                />
                              </Box>

                              <Typography variant="caption" color="text.secondary" display="block">
                                Dikelola oleh: @{w.creator_username}
                              </Typography>
                            </Box>

                            <Box sx={{ width: '100%', mt: 3, pt: 2, borderTop: '1px solid #eee' }}>
                              <Typography variant="caption" color="text.secondary">
                                Tagihan / Saldo Anda
                              </Typography>
                              <Typography
                                variant="h5"
                                sx={{
                                  fontWeight: 800,
                                  color: w.balance < 0 ? '#d32f2f' : w.balance > 0 ? '#0288d1' : '#2e7d32',
                                }}
                              >
                                {formatRupiah(w.balance)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {w.entry_count} total transaksi
                              </Typography>
                            </Box>
                          </CardActionArea>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      {/* Tab 2: Diarsipkan */}
      {tab === 2 && (
        <>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : archivedWallets.length === 0 ? (
            <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 2 }}>
              <ArchiveIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Tidak Ada Buku yang Diarsipkan
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Buku yang telah diselesaikan dan diarsipkan akan muncul di sini dalam mode baca-saja.
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={2.5}>
              {archivedWallets.map((w) => (
                <Grid item xs={12} sm={6} md={4} key={w.id}>
                  <Card
                    elevation={1}
                    sx={{
                      borderRadius: 2.5,
                      bgcolor: '#fafafa',
                      border: '1px solid #eee',
                    }}
                  >
                    <CardActionArea
                      onClick={() => navigate(`/wallets/${w.id}`)}
                      sx={{ p: 2.5 }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {w.name}
                        </Typography>
                        <Chip label="Diarsipkan" size="small" />
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Pembuat: {w.creator_username} {w.owner_username ? `• Rekan: @${w.owner_username}` : ''}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, mt: 2 }}>
                        Saldo Akhir: {formatRupiah(w.balance)}
                      </Typography>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {/* Modals */}
      <ShoppingSessionModal
        open={openShoppingSession}
        wallets={wallets}
        onClose={() => setOpenShoppingSession(false)}
        onSuccess={() => fetchDashboardData()}
      />

      {/* Create Wallet Dialog */}
      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleCreateWallet}>
          <DialogTitle sx={{ fontWeight: 700 }}>Buat Buku Titipan Baru</DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Nama Buku / Nama Rekan"
                fullWidth
                required
                autoFocus
                placeholder="Contoh: Rendy - Kopi / Budi Nasi Padang"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
              />

              <TextField
                label="Tautkan ke Username Rekan (Opsional)"
                fullWidth
                placeholder="Contoh: budi_santoso"
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                helperText="Bisa dibuat sekarang dan ditautkan nanti via menu tautan."
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
