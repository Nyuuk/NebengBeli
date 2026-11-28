import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { alpha } from '@mui/material/styles';
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
import { ResponsiveTabs } from '../components/ResponsiveTabs';
import { AdminFilterBar } from '../components/AdminFilterBar';
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
  getCurrentUserId,
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
  const [walletSearch, setWalletSearch] = useState<string>('');

  // Modals
  const [openCreate, setOpenCreate] = useState<boolean>(false);
  const [openShoppingSession, setOpenShoppingSession] = useState<boolean>(false);
  const [newWalletName, setNewWalletName] = useState<string>('');
  const [targetUsername, setTargetUsername] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  const fetchDashboardData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      setLoading(true);
      setError(null);

      const effectiveUserId = user?.id || getCurrentUserId() || undefined;

      if (isOnline) {
        // Online: Fetch fresh data from APIs
        // getWalletsApi(true) already returns active + archived wallets (archived=true
        // means "include archived", not "archived only"), so a single call covers both;
        // calling it alongside getWalletsApi(false) would double every active wallet.
        let onlineWallets: Wallet[] | null = null;
        let onlineWalletsError: unknown = null;
        try {
          onlineWallets = await getWalletsApi(true);
        } catch (err) {
          onlineWalletsError = err;
        }

        const [linkRequests, insightsData] = await Promise.all([
          listLinkRequestsApi().catch(() => []),
          getCreatorInsightsApi().catch(() => null),
        ]);

        if (onlineWallets !== null) {
          setWallets(onlineWallets);
          await setCachedWallets(onlineWallets, 'all', effectiveUserId);

          const pending = (linkRequests || []).filter((r) => r.status === 'pending');
          setPendingRequestsCount(pending.length);

          if (insightsData) {
            setInsights(insightsData);
            await setCachedInsights(insightsData, 'creator', effectiveUserId);
          } else {
            // Compute fallback insights from active creator wallets
            const creatorWallets = onlineWallets.filter(
              (w) => !w.is_archived && (w.creator_id === effectiveUserId || w.user_role === 'creator' || w.user_role === 'both')
            );
            const moneyOutside = creatorWallets.reduce((sum, w) => sum + (w.balance < 0 ? -w.balance : 0), 0);
            const fallbackInsights: CreatorInsights = {
              total_money_outside: moneyOutside,
              active_wallets_count: creatorWallets.length,
              total_wallets_count: onlineWallets.length,
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
            await setCachedInsights(fallbackInsights, 'creator', effectiveUserId);
          }

          setLastSyncedAt(new Date().toISOString());
        } else {
          // Backend is offline / returned 503 / network error:
          // FALLBACK to IndexedDB cache! Do NOT set empty array or overwrite cache!
          console.warn('[DashboardPage] Server offline or request failed, falling back to cache:', onlineWalletsError);

          const cachedWalletsRecord = await getCachedWallets('all', effectiveUserId);
          if (cachedWalletsRecord && cachedWalletsRecord.wallets) {
            setWallets(cachedWalletsRecord.wallets);
            setLastSyncedAt(cachedWalletsRecord.cached_at);
          } else {
            setWallets([]);
            const apiErr = onlineWalletsError as { message?: string };
            setError(apiErr?.message || 'Gagal memuat data buku titipan (server offline).');
          }

          const cachedInsightsRecord = await getCachedInsights('creator', effectiveUserId);
          if (cachedInsightsRecord) {
            setInsights(cachedInsightsRecord.data);
          } else if (cachedWalletsRecord?.wallets) {
            const creatorWallets = cachedWalletsRecord.wallets.filter(
              (w) => !w.is_archived && (w.creator_id === effectiveUserId || w.user_role === 'creator' || w.user_role === 'both')
            );
            const moneyOutside = creatorWallets.reduce((sum, w) => sum + (w.balance < 0 ? -w.balance : 0), 0);
            const fallbackInsights: CreatorInsights = {
              total_money_outside: moneyOutside,
              active_wallets_count: creatorWallets.length,
              total_wallets_count: cachedWalletsRecord.wallets.length,
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
              cached_at: cachedWalletsRecord.cached_at,
            };
            setInsights(fallbackInsights);
          }
        }
      } else {
        // Explicitly offline: Load from IndexedDB cache
        const cachedWalletsRecord = await getCachedWallets('all', effectiveUserId);
        if (cachedWalletsRecord) {
          setWallets(cachedWalletsRecord.wallets);
          setLastSyncedAt(cachedWalletsRecord.cached_at);
        } else {
          setWallets([]);
        }

        const cachedInsightsRecord = await getCachedInsights('creator', effectiveUserId);
        if (cachedInsightsRecord) {
          setInsights(cachedInsightsRecord.data);
        } else if (cachedWalletsRecord?.wallets) {
          const creatorWallets = cachedWalletsRecord.wallets.filter(
            (w) => !w.is_archived && (w.creator_id === effectiveUserId || w.user_role === 'creator' || w.user_role === 'both')
          );
          const moneyOutside = creatorWallets.reduce((sum, w) => sum + (w.balance < 0 ? -w.balance : 0), 0);
          const fallbackInsights: CreatorInsights = {
            total_money_outside: moneyOutside,
            active_wallets_count: creatorWallets.length,
            total_wallets_count: cachedWalletsRecord.wallets.length,
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
            cached_at: cachedWalletsRecord.cached_at,
          };
          setInsights(fallbackInsights);
        }
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat data buku titipan.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [isOnline, user?.id]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Foreground auto-refresh & global sync listener
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleForeground = () => {
      if (document.visibilityState === 'visible') {
        fetchDashboardData();
      }
    };

    const handleSynced = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.synced <= 0) {
        return;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        fetchDashboardData();
      }, 300);
    };

    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('focus', handleForeground);
    window.addEventListener('nebengbeli:synced', handleSynced);

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
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
    return wallets.filter((w) => !w.is_archived && (w.creator_id === currentUserId || w.user_role === 'creator' || w.user_role === 'both'));
  }, [wallets, currentUserId]);

  const ownerWallets = useMemo(() => {
    return wallets.filter((w) => !w.is_archived && (w.owner_id === currentUserId || w.user_role === 'owner'));
  }, [wallets, currentUserId]);

  const archivedWallets = useMemo(() => {
    return wallets.filter((w) => w.is_archived);
  }, [wallets]);

  const trimmedSearch = walletSearch.trim();
  const normalizedSearch = trimmedSearch.toLowerCase();
  const isSearching = Boolean(trimmedSearch);

  const matchesWalletSearch = useCallback(
    (w: Wallet) => {
      if (!normalizedSearch) return true;
      return (
        w.name.toLowerCase().includes(normalizedSearch) ||
        (w.owner_username || '').toLowerCase().includes(normalizedSearch) ||
        (w.creator_username || '').toLowerCase().includes(normalizedSearch)
      );
    },
    [normalizedSearch]
  );

  const filteredCreatorWallets = useMemo(() => {
    return creatorWallets.filter(matchesWalletSearch);
  }, [creatorWallets, matchesWalletSearch]);

  const filteredOwnerWallets = useMemo(() => {
    return ownerWallets.filter(matchesWalletSearch);
  }, [ownerWallets, matchesWalletSearch]);

  const filteredArchivedWallets = useMemo(() => {
    return archivedWallets.filter(matchesWalletSearch);
  }, [archivedWallets, matchesWalletSearch]);

  // Group owner wallets per creator with subtotals
  const ownerWalletsByCreator = useMemo(() => {
    const groups: Record<string, { creator_username: string; wallets: Wallet[]; subtotal: number }> = {};

    for (const w of filteredOwnerWallets) {
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
  }, [filteredOwnerWallets]);

  const renderSearchEmptyState = () => (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        p: { xs: 3, sm: 5 },
        textAlign: 'center',
        borderRadius: 1.5,
        borderColor: 'divider',
      }}
    >
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        {`Tidak ada buku yang cocok dengan pencarian "${trimmedSearch}".`}
      </Typography>
      <Button
        variant="outlined"
        onClick={() => setWalletSearch('')}
        sx={{ borderRadius: 1 }}
      >
        Reset Pencarian
      </Button>
    </Paper>
  );

  return (
    <Layout>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2rem' }, letterSpacing: -0.5 }}>
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
            bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
            border: '1px solid',
            borderColor: (theme) => alpha(theme.palette.info.main, 0.25),
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
        <ResponsiveTabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab label={`Dompet Saya Kelola (${filteredCreatorWallets.length})`} />
          <Tab label={`Dompet Milik Saya (${filteredOwnerWallets.length})`} />
          <Tab label={`Diarsipkan (${filteredArchivedWallets.length})`} icon={<ArchiveIcon fontSize="small" />} iconPosition="start" />
        </ResponsiveTabs>
      </Box>

      {/* Search Bar */}
      <AdminFilterBar
        searchValue={walletSearch}
        onSearchChange={setWalletSearch}
        searchPlaceholder="Cari nama buku, rekan, atau pembuat..."
        searchAriaLabel="Cari buku dompet"
        hasActiveFilters={isSearching}
        onReset={() => setWalletSearch('')}
      />

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
          ) : filteredCreatorWallets.length === 0 ? (
            isSearching ? (
              renderSearchEmptyState()
            ) : (
              <Paper elevation={0} sx={{ p: 5, textAlign: 'center', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
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
            )
          ) : (
            <Grid container spacing={2.5}>
              {filteredCreatorWallets.map((w) => (
                <Grid item xs={12} sm={6} md={4} key={w.id}>
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1.5,
                      border: '1px solid', borderColor: 'divider',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 0.15s ease-in-out, box-shadow 0.15s',
                      '&:hover': {
                        transform: 'translateY(-3px)',
                        borderColor: 'primary.main',
                        boxShadow: 1,
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

                      <Box sx={{ width: '100%', mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" color="text.secondary">
                          Status Saldo
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 800,
                            color: w.balance < 0 ? 'error.main' : w.balance > 0 ? 'info.main' : 'success.main',
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
          ) : filteredOwnerWallets.length === 0 ? (
            isSearching ? (
              renderSearchEmptyState()
            ) : (
              <Paper elevation={0} sx={{ p: 5, textAlign: 'center', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                <AccountBalanceWalletIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 1 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Belum Ada Buku Titipan Milik Anda
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Buku yang ditautkan oleh pembuat titipan (OB/rekan) akan muncul di sini setelah Anda menyetujui undangannya.
                </Typography>
              </Paper>
            )
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
              {ownerWalletsByCreator.map((group) => (
                <Box key={group.creator_username}>
                  <Box
                    sx={{
                      p: 2,
                      mb: 2,
                      borderRadius: 2,
                      bgcolor: 'grey.100',
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
                          color: group.subtotal < 0 ? 'error.main' : group.subtotal > 0 ? 'info.main' : 'success.main',
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
                          elevation={0}
                          sx={{
                            borderRadius: 1.5,
                            border: '1px solid', borderColor: 'divider',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'transform 0.15s ease-in-out, box-shadow 0.15s',
                            '&:hover': {
                              transform: 'translateY(-3px)',
                              borderColor: 'primary.main',
                              boxShadow: 1,
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

                            <Box sx={{ width: '100%', mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                              <Typography variant="caption" color="text.secondary">
                                Tagihan / Saldo Anda
                              </Typography>
                              <Typography
                                variant="h5"
                                sx={{
                                  fontWeight: 800,
                                  color: w.balance < 0 ? 'error.main' : w.balance > 0 ? 'info.main' : 'success.main',
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
          ) : filteredArchivedWallets.length === 0 ? (
            isSearching ? (
              renderSearchEmptyState()
            ) : (
              <Paper elevation={0} sx={{ p: 5, textAlign: 'center', borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                <ArchiveIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 1 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Tidak Ada Buku yang Diarsipkan
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Buku yang telah diselesaikan dan diarsipkan akan muncul di sini dalam mode baca-saja.
                </Typography>
              </Paper>
            )
          ) : (
            <Grid container spacing={2.5}>
              {filteredArchivedWallets.map((w) => (
                <Grid item xs={12} sm={6} md={4} key={w.id}>
                  <Card
                    elevation={0}
                    sx={{
                      borderRadius: 1.5,
                      bgcolor: 'background.default',
                      border: '1px solid', borderColor: 'divider',
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
          <DialogActions>
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
