import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Tabs,
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
  ButtonGroup,
  LinearProgress,
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SecurityIcon from '@mui/icons-material/Security';
import KeyIcon from '@mui/icons-material/Key';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { Layout } from '../components/Layout';
import { formatRupiah } from '../components/BalanceCard';
import {
  adminGetStatsApi,
  adminListUsersApi,
  adminResetPasswordApi,
  adminListWalletsApi,
  adminListAuditLogsApi,
  adminGetTrendsAdapterApi,
  adminGetBreakdownsAdapterApi,
  AdminStats,
  AdminBreakdownResponse,
} from '../api/admin';
import { User, Wallet, AuditLog, AdminTrendsData } from '../types';

export const AdminPage: React.FC = () => {
  const [tab, setTab] = useState<number>(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trends, setTrends] = useState<AdminTrendsData | null>(null);
  const [breakdown, setBreakdown] = useState<AdminBreakdownResponse | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [users, setUsers] = useState<User[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Password reset modal
  const [openReset, setOpenReset] = useState<boolean>(false);
  const [resetUsername, setResetUsername] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (tab === 0) {
        const [statsData, trendsData, breakdownData] = await Promise.all([
          adminGetStatsApi(),
          adminGetTrendsAdapterApi(),
          adminGetBreakdownsAdapterApi(),
        ]);
        setStats(statsData?.stats || null);
        setTrends(trendsData?.trends || null);
        setBreakdown(breakdownData || null);
      } else if (tab === 1) {
        const breakdownData = await adminGetBreakdownsAdapterApi();
        setBreakdown(breakdownData || null);
      } else if (tab === 2) {
        const usersData = await adminListUsersApi(50, 0);
        setUsers(usersData?.users || []);
      } else if (tab === 3) {
        const walletsData = await adminListWalletsApi(50, 0);
        setWallets(walletsData?.wallets || []);
      } else if (tab === 4) {
        const auditsData = await adminListAuditLogsApi({ limit: 50, offset: 0 });
        setAuditLogs(auditsData?.audit_logs || []);
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat data admin.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUsername || !newPassword) return;

    setIsSubmitting(true);
    try {
      await adminResetPasswordApi(resetUsername, newPassword);
      setMessage(`Password pengguna '${resetUsername}' berhasil direset dan seluruh sesi lama telah dicabut.`);
      setOpenReset(false);
      setResetUsername('');
      setNewPassword('');
      fetchData();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal mereset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeTrends =
    trendPeriod === 'daily'
      ? trends?.daily_trends || []
      : trendPeriod === 'weekly'
      ? trends?.weekly_trends || []
      : trends?.monthly_trends || [];

  const maxTrendVolume = Math.max(...activeTrends.map((t) => t.volume), 1);

  return (
    <Layout>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Admin & System Control Panel
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pemantauan sistem, tren titipan, analisis rincian keuangan, audit log aktivitas, dan pengelolaan kredensial
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

      {/* Admin Navigation Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab icon={<TrendingUpIcon fontSize="small" />} iconPosition="start" label="Dashboard & Tren" />
          <Tab icon={<AssessmentIcon fontSize="small" />} iconPosition="start" label="Rincian Pembuat & Buku" />
          <Tab icon={<PeopleIcon fontSize="small" />} iconPosition="start" label="Pengguna (Users)" />
          <Tab icon={<AccountBalanceWalletIcon fontSize="small" />} iconPosition="start" label="Semua Buku (Wallets)" />
          <Tab icon={<SecurityIcon fontSize="small" />} iconPosition="start" label="Audit Logs" />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* TAB 0: Dashboard & Trends */}
          {tab === 0 && (
            <Box>
              {stats && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={1} sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <PeopleIcon sx={{ fontSize: 40, color: 'primary.main' }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary">Total Pengguna</Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800 }}>{stats.total_users}</Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={1} sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <AccountBalanceWalletIcon sx={{ fontSize: 40, color: '#0288d1' }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary">Buku Aktif / Total</Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800 }}>{stats.active_wallets} / {stats.total_wallets}</Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={1} sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <ReceiptLongIcon sx={{ fontSize: 40, color: '#388e3c' }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary">Total Transaksi</Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800 }}>{stats.total_entries}</Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card elevation={1} sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <SecurityIcon sx={{ fontSize: 40, color: '#f57c00' }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary">Volume Perputaran</Typography>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>{formatRupiah(stats.total_volume)}</Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              )}

              {/* Trends Card */}
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} md={7}>
                  <Card elevation={1} sx={{ borderRadius: 2, p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Grafik Tren Titipan Belanja
                      </Typography>
                      <ButtonGroup size="small">
                        <Button
                          variant={trendPeriod === 'daily' ? 'contained' : 'outlined'}
                          onClick={() => setTrendPeriod('daily')}
                        >
                          Harian
                        </Button>
                        <Button
                          variant={trendPeriod === 'weekly' ? 'contained' : 'outlined'}
                          onClick={() => setTrendPeriod('weekly')}
                        >
                          Mingguan
                        </Button>
                        <Button
                          variant={trendPeriod === 'monthly' ? 'contained' : 'outlined'}
                          onClick={() => setTrendPeriod('monthly')}
                        >
                          Bulanan
                        </Button>
                      </ButtonGroup>
                    </Box>

                    {activeTrends.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        Belum ada data tren tercatat.
                      </Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {activeTrends.map((t, idx) => {
                          const percent = Math.min(100, Math.round((t.volume / maxTrendVolume) * 100));
                          return (
                            <Box key={idx}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                  {t.period_label} ({t.count} transaksi)
                                </Typography>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                  {formatRupiah(t.volume)}
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={percent}
                                sx={{ height: 8, borderRadius: 4, bgcolor: '#e2e8f0' }}
                              />
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                  </Card>
                </Grid>

                {/* Transaction Type Breakdown Card */}
                {breakdown?.transaction_types && (
                  <Grid item xs={12} md={5}>
                    <Card elevation={1} sx={{ borderRadius: 2, p: 2.5, height: '100%' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                        Rincian Jenis Transaksi
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ p: 1.5, bgcolor: '#ffebee', borderRadius: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#c62828' }}>
                              Titipan (Debit)
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#c62828' }}>
                              {formatRupiah(breakdown.transaction_types.titipan_volume)}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {breakdown.transaction_types.titipan_count} transaksi belanja ditalangi
                          </Typography>
                        </Box>

                        <Box sx={{ p: 1.5, bgcolor: '#e8f5e9', borderRadius: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                              Top-up / Pelunasan (Kredit)
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                              {formatRupiah(breakdown.transaction_types.topup_volume)}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {breakdown.transaction_types.topup_count} pembayaran diterima
                          </Typography>
                        </Box>

                        <Box sx={{ p: 1.5, bgcolor: '#fff3e0', borderRadius: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#ef6c00' }}>
                              Koreksi & Penyesuaian
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#ef6c00' }}>
                              {formatRupiah(breakdown.transaction_types.koreksi_volume)}
                            </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {breakdown.transaction_types.koreksi_count} koreksi nominal/pembatalan
                          </Typography>
                        </Box>
                      </Box>
                    </Card>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}

          {/* TAB 1: Breakdown per Creator & Wallet */}
          {tab === 1 && breakdown && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Creator Breakdown Table */}
              <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #eee' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Rincian Aktivitas per Pembuat Ledger (OB/GA)
                  </Typography>
                </Box>
                <TableContainer>
                  <Table>
                    <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Pembuat</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Jumlah Buku Dikelola</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Total Titipan</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Total Saldo Belum Lunas</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {breakdown.creators.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                            Belum ada pembuat buku aktif.
                          </TableCell>
                        </TableRow>
                      ) : (
                        breakdown.creators.map((c) => (
                          <TableRow key={c.creator_id} hover>
                            <TableCell sx={{ fontWeight: 600 }}>{c.creator_username}</TableCell>
                            <TableCell align="center">{c.wallet_count} buku</TableCell>
                            <TableCell align="center">{c.total_titipan_count}x</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, color: '#d32f2f' }}>
                              {formatRupiah(c.total_outstanding_balance)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {/* Wallet Breakdown Table */}
              <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #eee' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Rincian per Buku Ledger (Wallets) & Status Saldo
                  </Typography>
                </Box>
                <TableContainer>
                  <Table>
                    <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Nama Buku</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Pembuat</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Pemilik (Owner)</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700 }}>Jumlah Entri</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>Saldo Saat Ini</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {breakdown.wallets.map((w) => (
                        <TableRow key={w.wallet_id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{w.wallet_name}</TableCell>
                          <TableCell>{w.creator_username}</TableCell>
                          <TableCell>{w.owner_username ? `@${w.owner_username}` : '(unlinked)'}</TableCell>
                          <TableCell align="center">{w.entry_count}</TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontWeight: 700,
                              color: w.balance > 0 ? '#d32f2f' : w.balance < 0 ? '#0288d1' : '#2e7d32',
                            }}
                          >
                            {formatRupiah(w.balance)}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={w.is_archived ? 'Diarsipkan' : 'Aktif'}
                              size="small"
                              color={w.is_archived ? 'default' : 'success'}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          )}

          {/* TAB 2: Users */}
          {tab === 2 && (
            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <TableContainer>
                <Table>
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
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
                    {users.map((u) => (
                      <TableRow key={u.id} hover>
                        <TableCell><code>{u.id.substring(0, 8)}...</code></TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{u.username}</TableCell>
                        <TableCell>
                          <Chip
                            label={u.role}
                            size="small"
                            color={u.role === 'admin' ? 'secondary' : 'default'}
                          />
                        </TableCell>
                        <TableCell>{(u as { token_version?: number }).token_version || 1}</TableCell>
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
                            startIcon={<KeyIcon />}
                            onClick={() => {
                              setResetUsername(u.username);
                              setOpenReset(true);
                            }}
                          >
                            Reset Password
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* TAB 3: All Wallets */}
          {tab === 3 && (
            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <TableContainer>
                <Table>
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Nama Buku</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Pembuat</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Pemilik (Owner)</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Saldo</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {wallets.map((w) => (
                      <TableRow key={w.id} hover>
                        <TableCell><code>{w.id.substring(0, 8)}...</code></TableCell>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* TAB 4: Audit Logs */}
          {tab === 4 && (
            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <TableContainer>
                <Table>
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
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
                    {auditLogs.map((log) => (
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
                        <TableCell><code>{log.target_id ? `${log.target_id.substring(0, 8)}...` : '-'}</code></TableCell>
                        <TableCell>
                          <code>{typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)}</code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </>
      )}

      {/* Reset Password Dialog */}
      <Dialog open={openReset} onClose={() => setOpenReset(false)} maxWidth="xs" fullWidth>
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
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenReset(false)} color="inherit" disabled={isSubmitting}>
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
