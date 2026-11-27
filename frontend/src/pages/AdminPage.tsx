import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Tab,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import PeopleIcon from '@mui/icons-material/People';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SecurityIcon from '@mui/icons-material/Security';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssessmentIcon from '@mui/icons-material/Assessment';
import KeyIcon from '@mui/icons-material/Key';
import { Layout } from '../components/Layout';
import { ResponsiveTabs } from '../components/ResponsiveTabs';
import { TablePaginationBar } from '../components/TablePaginationBar';
import { formatRupiah } from '../components/BalanceCard';
import {
  adminGetStatsApi,
  adminListUsersApi,
  adminResetPasswordApi,
  adminPromoteUserApi,
  adminListWalletsApi,
  adminListAuditLogsApi,
  adminListEntriesApi,
  adminGetSummaryApi,
  adminListCreatorsApi,
  adminGetTrendsApi,
  AdminStats,
} from '../api/admin';
import {
  User,
  Wallet,
  AuditLog,
  Entry,
  AdminPeriodSummary,
  AdminCreatorDetail,
  AdminTrends,
} from '../types';

const adminTabs = ['users', 'wallets', 'entries', 'creators', 'trends', 'audit'];

export const AdminPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = Math.max(0, adminTabs.indexOf(searchParams.get('tab') || 'users'));
  const setTab = (index: number) => {
    setSearchParams((params) => {
      params.set('tab', adminTabs[index]);
      return params;
    });
  };
  const [trendSubTab, setTrendSubTab] = useState<number>(0);
  const [pagination, setPagination] = useState(() => Array.from({ length: 6 }, () => ({ page: 1, pageSize: 50, total: 0 })));
  const requestSeqRef = useRef(0);
  const [expandedMeta, setExpandedMeta] = useState<Record<string, boolean>>({});
  const [tabError, setTabError] = useState<Record<number, string | null>>({});
  const [resetError, setResetError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesSummary, setEntriesSummary] = useState<AdminPeriodSummary | null>(null);
  const [creators, setCreators] = useState<AdminCreatorDetail[]>([]);
  const [trends, setTrends] = useState<AdminTrends | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [promoteTarget, setPromoteTarget] = useState<User | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);

  // Password reset modal
  const [openReset, setOpenReset] = useState<boolean>(false);
  const [resetUsername, setResetUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isServerPaginated = tab === 0 || tab === 1 || tab === 2 || tab === 5;
  const activePage = isServerPaginated ? pagination[tab].page : 1;
  const activePageSize = isServerPaginated ? pagination[tab].pageSize : 50;

  const fetchData = useCallback(async (silent = false) => {
    const seq = ++requestSeqRef.current;
    try {
      if (!silent) setLoading(true);
      setError(null);
      setTabError((e) => ({ ...e, [tab]: null }));

      if (tab === 0) {
        const [statsData, usersData] = await Promise.all([
          adminGetStatsApi(),
          adminListUsersApi(activePageSize, (activePage - 1) * activePageSize),
        ]);
        if (seq !== requestSeqRef.current) return;
        setStats(statsData?.stats || null);
        setUsers(usersData?.users || []);
        setPagination((p) => p.map((x, i) => i === tab && x.total !== (usersData?.total ?? 0) ? { ...x, total: usersData?.total ?? 0 } : x));
      } else if (tab === 1) {
        const walletsData = await adminListWalletsApi(activePageSize, (activePage - 1) * activePageSize);
        if (seq !== requestSeqRef.current) return;
        setWallets(walletsData?.wallets || []);
        setPagination((p) => p.map((x, i) => i === tab && x.total !== (walletsData?.total ?? 0) ? { ...x, total: walletsData?.total ?? 0 } : x));
      } else if (tab === 2) {
        try {
          const entriesData = await adminListEntriesApi({ limit: activePageSize, offset: (activePage - 1) * activePageSize });
          if (seq !== requestSeqRef.current) return;
          setEntries(entriesData?.entries || []);
          setPagination((p) => p.map((x, i) => i === tab && x.total !== (entriesData?.total ?? 0) ? { ...x, total: entriesData?.total ?? 0 } : x));
          let summary = entriesData?.summary || null;
          if (!summary) {
            try {
              const summaryData = await adminGetSummaryApi();
              if (seq !== requestSeqRef.current) return;
              summary = summaryData.summary || null;
            } catch {
              if (seq !== requestSeqRef.current) return;
              /* summary optional */
            }
          }
          if (seq !== requestSeqRef.current) return;
          setEntriesSummary(summary);
        } catch (err: unknown) {
          const apiErr = err as { status?: number; message?: string };
          if (apiErr.status === 404) {
            if (seq !== requestSeqRef.current) return;
            // Backwards compatibility fallback if backend does not support admin entries endpoint
            setEntries([]);
            setEntriesSummary(null);
            updateTabPagination(tab, { total: 0, page: 1 });
          } else {
            throw err;
          }
        }
      } else if (tab === 3) {
        try {
          const creatorsData = await adminListCreatorsApi();
          if (seq !== requestSeqRef.current) return;
          setCreators(creatorsData?.creators || []);
          setPagination((p) => p.map((x, i) => i === tab && x.total !== (creatorsData?.total ?? creatorsData.creators.length) ? { ...x, total: creatorsData?.total ?? creatorsData.creators.length } : x));
        } catch (err: unknown) {
          const apiErr = err as { status?: number; message?: string };
          if (apiErr.status === 404) {
            if (seq !== requestSeqRef.current) return;
            // Backwards compatibility fallback
            setCreators([]);
            updateTabPagination(tab, { total: 0, page: 1 });
          } else {
            throw err;
          }
        }
      } else if (tab === 4) {
        try {
          const trendsData = await adminGetTrendsApi();
          if (seq !== requestSeqRef.current) return;
          setTrends(trendsData?.trends || null);
        } catch (err: unknown) {
          const apiErr = err as { status?: number; message?: string };
          if (apiErr.status === 404) {
            if (seq !== requestSeqRef.current) return;
            // Backwards compatibility fallback
            setTrends(null);
          } else {
            throw err;
          }
        }
      } else if (tab === 5) {
        const auditsData = await adminListAuditLogsApi({ limit: activePageSize, offset: (activePage - 1) * activePageSize });
        if (seq !== requestSeqRef.current) return;
        setAuditLogs(auditsData?.audit_logs || []);
        setPagination((p) => p.map((x, i) => i === tab && x.total !== (auditsData?.total ?? 0) ? { ...x, total: auditsData?.total ?? 0 } : x));
      }
    } catch (err: unknown) {
      if (seq !== requestSeqRef.current) return;
      const apiErr = err as { message?: string };
      const msg = apiErr.message || 'Gagal memuat data admin.';
      setTabError((e) => ({ ...e, [tab]: msg }));
      if (tab === 0) setUsers([]); else if (tab === 1) setWallets([]); else if (tab === 2) { setEntries([]); setEntriesSummary(null); } else if (tab === 3) setCreators([]); else if (tab === 4) setTrends(null); else if (tab === 5) setAuditLogs([]);
    } finally {
      if (seq === requestSeqRef.current && !silent) setLoading(false);
    }
  }, [tab, activePage, activePageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(pagination[tab].total / pagination[tab].pageSize));
    if (pagination[tab].page > totalPages) {
      setPagination((p) => p.map((x, i) => i === tab ? { ...x, page: totalPages } : x));
    }
  }, [tab, pagination]);

  const updateTabPagination = (index: number, values: Partial<(typeof pagination)[number]>) => {
    setPagination((p) => p.map((x, i) => i === index ? { ...x, ...values } : x));
  };

  const paginationBar = (index: number) => (
    <TablePaginationBar {...pagination[index]} loading={loading} onPageChange={(page) => setPagination((p) => p.map((x, i) => i === index ? { ...x, page } : x))} onPageSizeChange={(pageSize) => setPagination((p) => p.map((x, i) => i === index ? { ...x, pageSize, page: 1 } : x))} />
  );

  const handlePromote = async () => {
    if (!promoteTarget || promoting) return;
    setPromoting(true);
    setPromoteError(null);
    setMessage(null);
    try {
      await adminPromoteUserApi(promoteTarget.id);
      setMessage(`Pengguna '${promoteTarget.username}' berhasil dipromosikan menjadi admin.`);
      setPromoteTarget(null);
      await fetchData(true);
    } catch (err: unknown) {
      setPromoteError((err as { message?: string }).message || 'Gagal mempromosikan pengguna.');
    } finally {
      setPromoting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUsername) return;
    if (newPassword.length < 6) { setResetError('Password minimal 6 karakter.'); return; }

    setResetError(null);
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      await adminResetPasswordApi(resetUsername, newPassword);
      setMessage(`Password pengguna '${resetUsername}' berhasil direset dan seluruh sesi lama telah dicabut.`);
      setOpenReset(false);
      setResetUsername('');
      setNewPassword('');
      fetchData(users.length > 0);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setResetError(apiErr.message || 'Gagal mereset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', sm: '2rem' } }}>
          Admin & System Control Panel
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pemantauan sistem, analisis perputaran dana, audit log, dan pengelolaan kredensial
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

      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', alignItems: 'center', gap: 2 }}>
                <PeopleIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Pengguna</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{stats.total_users}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', alignItems: 'center', gap: 2 }}>
                <AccountBalanceWalletIcon sx={{ fontSize: 40, color: 'info.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Buku Aktif / Total</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{stats.active_wallets} / {stats.total_wallets}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ReceiptLongIcon sx={{ fontSize: 40, color: 'success.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Transaksi</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{stats.total_entries}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', height: '100%' }}>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', alignItems: 'center', gap: 2 }}>
                <SecurityIcon sx={{ fontSize: 40, color: 'warning.main' }} />
                <Box>
                  <Typography variant="caption" color="text.secondary">Volume Perputaran</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{formatRupiah(stats.total_volume)}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Admin Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <ResponsiveTabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab icon={<PeopleIcon />} iconPosition="start" label="Pengguna (Users)" />
          <Tab icon={<AccountBalanceWalletIcon />} iconPosition="start" label="Semua Buku (Wallets)" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Semua Transaksi (Entries)" />
          <Tab icon={<AssessmentIcon />} iconPosition="start" label="Rekap Pembuat (Creators)" />
          <Tab icon={<TrendingUpIcon />} iconPosition="start" label="Tren Sistem (Trends)" />
          <Tab icon={<SecurityIcon />} iconPosition="start" label="Audit Logs" />
        </ResponsiveTabs>
      </Box>

      {loading && !tabError[tab] ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : tabError[tab] ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => fetchData()}>Coba Lagi</Button>}>{tabError[tab]}</Alert>
      ) : (
        <>
          {/* TAB 0: USERS */}
          {tab === 0 && (
            <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <TableContainer>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Username</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Token Version</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Terdaftar</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Aksi</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.length === 0 ? <TableRow><TableCell colSpan={6} align="center">Tidak ada data pengguna.</TableCell></TableRow> : users.map((u) => (
                      <TableRow key={u.id} hover>
                        <TableCell><code style={{ whiteSpace: 'nowrap' }}>{u.id.substring(0, 8)}...</code></TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{u.username}</TableCell>
                        <TableCell>
                          <Chip
                            label={u.role}
                            size="small"
                            color={u.role === 'admin' ? 'secondary' : 'default'}
                          />
                        </TableCell>
                        <TableCell>{u.token_version ?? 1}</TableCell>
                        <TableCell>
                          {new Date(u.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell align="center">
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ whiteSpace: 'nowrap' }}
                            startIcon={<KeyIcon />}
                            onClick={() => {
                              setResetUsername(u.username);
                              setOpenReset(true);
                            }}
                          >
                            Reset Password
                          </Button>
                          {u.role === 'user' && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<SecurityIcon />}
                              sx={{ m: 0.5, borderRadius: 1, whiteSpace: 'nowrap' }}
                              onClick={() => { setPromoteTarget(u); setPromoteError(null); }}
                            >
                              Promosikan ke Admin
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {paginationBar(0)}
            </Paper>
          )}

          {/* TAB 1: WALLETS */}
          {tab === 1 && (
            <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <TableContainer>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Nama Buku</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Pembuat</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Pemilik (Owner)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Saldo</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Aksi</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {wallets.length === 0 ? <TableRow><TableCell colSpan={7} align="center">Tidak ada data buku.</TableCell></TableRow> : wallets.map((w) => (
                      <TableRow key={w.id} hover>
                        <TableCell><code style={{ whiteSpace: 'nowrap' }}>{w.id.substring(0, 8)}...</code></TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{w.name}</TableCell>
                        <TableCell>{w.creator_username}</TableCell>
                        <TableCell>{w.owner_username || '(unlinked)'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>{formatRupiah(w.balance)}</TableCell>
                        <TableCell>
                          <Chip
                            label={w.is_archived ? 'Diarsipkan' : 'Aktif'}
                            size="small"
                            color={w.is_archived ? 'default' : 'success'}
                          />
                        </TableCell>
                        <TableCell>
                          <Button component={RouterLink} to={`/admin/wallets/${w.id}`} variant="outlined" size="small">
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {paginationBar(1)}
            </Paper>
          )}

          {/* TAB 2: ENTRIES & SUMMARY */}
          {tab === 2 && (
            <Box>
              {entriesSummary && (
                <Grid container spacing={2} sx={{ mb: 2.5 }}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', height: '100%' }}>

                      <Typography variant="caption" color="text.secondary">Total Transaksi Titipan</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {formatRupiah(Math.abs(entriesSummary.total_titipan_amount))} ({entriesSummary.total_titipan_count})
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', height: '100%' }}>

                      <Typography variant="caption" color="text.secondary">Total Pembayaran Top-up</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'info.main' }}>
                        {formatRupiah(Math.abs(entriesSummary.total_topup_amount))} ({entriesSummary.total_topup_count})
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', height: '100%' }}>

                      <Typography variant="caption" color="text.secondary">Total Penyesuaian Koreksi</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>
                        {formatRupiah(entriesSummary.total_koreksi_amount)} ({entriesSummary.total_koreksi_count})
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', height: '100%' }}>

                      <Typography variant="caption" color="text.secondary">Saldo Bersih / Total Volume</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>{formatRupiah(entriesSummary.net_balance)}</Typography>
                      <Typography variant="body2" color="text.secondary">Volume: {formatRupiah(entriesSummary.total_volume)}</Typography>
                    </Paper>
                  </Grid>
                </Grid>
              )}

              <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                <TableContainer>
                  <Table sx={{ minWidth: 650 }}>
                    <TableHead sx={{ bgcolor: 'grey.100' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Nama Item / Keterangan</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Buku (Wallet)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Pembuat</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Tipe</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Nominal</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Waktu</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                            Tidak ada data transaksi.
                          </TableCell>
                        </TableRow>
                      ) : (
                        entries.map((e) => (
                          <TableRow key={e.id} hover>
                            <TableCell><code style={{ whiteSpace: 'nowrap' }}>{e.id.substring(0, 8)}...</code></TableCell>
                            <TableCell sx={{ fontWeight: 600 }}><Box><Typography sx={{ fontWeight: 600 }}>{e.item_name || '-'}</Typography>{e.note && <Typography variant="caption" color="text.secondary" display="block">{e.note}</Typography>}</Box></TableCell>
                            <TableCell>{e.wallet_name || (e.wallet_id ? `${e.wallet_id.substring(0, 8)}...` : '-')}</TableCell>
                            <TableCell>{e.created_by_username || '-'}</TableCell>
                            <TableCell>
                              <Chip
                                label={e.type === 'titipan' ? 'Titipan' : e.type === 'topup' ? 'Top-up / Bayar' : 'Koreksi'}
                                size="small"
                                color={
                                  e.type === 'titipan' ? 'error' : e.type === 'topup' ? 'success' : 'warning'
                                }
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {formatRupiah(e.effective_amount ?? e.amount)}{e.effective_amount !== undefined && e.effective_amount !== e.amount && <Typography variant="caption" display="block" color="text.secondary">Koreksi dari {formatRupiah(e.amount)}</Typography>}
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {new Date(e.occurred_at || e.created_at).toLocaleDateString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                {paginationBar(2)}
              </Paper>
            </Box>
          )}

          {/* TAB 3: CREATORS */}
          {tab === 3 && (
            <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <TableContainer>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Pembuat (Creator)</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Total Buku</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Buku Aktif</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Titipan (Nominal)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Top-up (Nominal)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Koreksi</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Total Piutang (Outstanding)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {creators.slice((pagination[3].page - 1) * pagination[3].pageSize, pagination[3].page * pagination[3].pageSize).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          Tidak ada data pembuat.
                        </TableCell>
                      </TableRow>
                    ) : (
                      creators.slice((pagination[3].page - 1) * pagination[3].pageSize, pagination[3].page * pagination[3].pageSize).map((c) => (
                        <TableRow key={c.creator_id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{c.username}</TableCell>
                          <TableCell align="center">{c.total_wallets}</TableCell>
                          <TableCell align="center">
                            <Chip label={c.active_wallets} size="small" color="success" />
                          </TableCell>
                          <TableCell align="right">{formatRupiah(Math.abs(c.total_titipan_amount))}</TableCell>
                          <TableCell align="right">{formatRupiah(Math.abs(c.total_topup_amount))}</TableCell>
                          <TableCell align="right">{formatRupiah(c.total_koreksi_amount)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: c.total_outstanding > 0 ? 'error.main' : c.total_outstanding < 0 ? 'success.main' : 'text.secondary' }}>
                            {formatRupiah(c.total_outstanding)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              {paginationBar(3)}
            </Paper>
          )}

          {/* TAB 4: TRENDS */}
          {tab === 4 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Rolling window: 30 hari, 12 minggu, atau 12 bulan. Tren menghitung transaksi titipan saja.</Typography>
              <ResponsiveTabs
                value={trendSubTab}
                onChange={(_, v) => setTrendSubTab(v)}
                sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
              >
                <Tab label="Tren Harian (Daily)" />
                <Tab label="Tren Mingguan (Weekly)" />
                <Tab label="Tren Bulanan (Monthly)" />
              </ResponsiveTabs>

              {(() => {
                const currentList =
                  trendSubTab === 0
                    ? trends?.daily || []
                    : trendSubTab === 1
                    ? trends?.weekly || []
                    : trends?.monthly || [];

                return (
                  <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                    <TableContainer>
                      <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ bgcolor: 'grey.100' }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Periode (Label)</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700 }}>Jumlah Transaksi</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>Total Perputaran</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {currentList.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                Belum ada data tren untuk periode ini.
                              </TableCell>
                            </TableRow>
                          ) : (
                            currentList.map((pt, idx) => (
                              <TableRow key={idx} hover>
                                <TableCell sx={{ fontWeight: 600 }}>{pt.label}</TableCell>
                                <TableCell align="center">{pt.count}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {formatRupiah(pt.total_amount)}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                );
              })()}
            </Box>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {tab === 5 && (
            <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <TableContainer>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Waktu</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Aktor</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Aksi (Action)</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Target Tipe</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Target ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Metadata</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {auditLogs.length === 0 ? <TableRow><TableCell colSpan={6} align="center">Tidak ada data audit log.</TableCell></TableRow> : auditLogs.map((log) => {
                      const meta = typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata);
                      const isLong = meta.length > 100;
                      const open = Boolean(expandedMeta[log.id]);
                      return (
                      <TableRow key={log.id} hover>
                        <TableCell>
                          <Typography variant="caption">
                            {new Date(log.created_at).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{log.actor_username || 'system'}</TableCell>
                        <TableCell><Chip label={log.action} size="small" variant="outlined" /></TableCell>
                        <TableCell>{log.target_type}</TableCell>
                        <TableCell><code style={{ whiteSpace: 'nowrap' }}>{log.target_id ? `${log.target_id.substring(0, 8)}...` : '-'}</code></TableCell>
                        <TableCell sx={{ maxWidth: 280, overflowWrap: 'anywhere' }}>
                          <code>{isLong && !open ? `${meta.slice(0, 100)}...` : meta}</code>
                          {isLong && <Button size="small" onClick={() => setExpandedMeta((m) => ({ ...m, [log.id]: !open }))}>{open ? 'Tutup' : 'Lihat'}</Button>}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              {paginationBar(5)}
            </Paper>
          )}
        </>
      )}

      <Dialog
        open={Boolean(promoteTarget)}
        onClose={() => { if (!promoting) setPromoteTarget(null); }}
        aria-labelledby="promote-dialog-title"
        aria-describedby="promote-dialog-description"
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 1.5 } }}
      >
        <DialogTitle id="promote-dialog-title" sx={{ p: 2.5, fontWeight: 700 }}>Promosikan Pengguna ke Admin?</DialogTitle>
        <DialogContent dividers sx={{ p: 2.5 }}>
          <Typography id="promote-dialog-description" variant="body1" color="text.secondary">
            Pengguna <strong>{promoteTarget?.username}</strong> akan mendapat seluruh akses admin, termasuk pengelolaan pengguna dan data sistem. Akses berlaku langsung tanpa login ulang.
          </Typography>
          {promoteError && <Alert severity="error" sx={{ mt: 2 }}>{promoteError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Button color="inherit" disabled={promoting} onClick={() => setPromoteTarget(null)} sx={{ borderRadius: 1 }}>Batal</Button>
          <Button variant="contained" disabled={promoting} onClick={handlePromote} sx={{ borderRadius: 1 }}>
            {promoting ? 'Memproses...' : 'Ya, Promosikan'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={openReset} onClose={() => { if (!isSubmitting) { setOpenReset(false); setNewPassword(''); setResetUsername(''); setResetError(null); } }} maxWidth="xs" fullWidth>
        <form onSubmit={handleResetPassword}>
          <DialogTitle sx={{ fontWeight: 700 }}>Reset Password Pengguna</DialogTitle>
          <DialogContent dividers>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Mereset password untuk user: <strong>{resetUsername}</strong>. Sesi aktif user akan otomatis dicabut melalui pembaruan <code>token_version</code>.
            </Typography>
            <TextField
              label="Password Baru"
              type="password"
              fullWidth
              required
              autoFocus
              placeholder="Minimal 6 karakter"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setResetError(null); }}
              error={Boolean(resetError)}
              helperText="Minimal 6 karakter"
            />
            {resetError && <Alert severity="error" sx={{ mt: 1 }}>{resetError}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { if (!isSubmitting) { setOpenReset(false); setNewPassword(''); setResetUsername(''); setResetError(null); } }} color="inherit" disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" variant="contained" color="warning" disabled={isSubmitting}>
              {isSubmitting ? 'Mereset...' : 'Reset & Cabut Sesi'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Layout>
  );
};
