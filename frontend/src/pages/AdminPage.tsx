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
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SecurityIcon from '@mui/icons-material/Security';
import KeyIcon from '@mui/icons-material/Key';
import { Layout } from '../components/Layout';
import { formatRupiah } from '../components/BalanceCard';
import {
  adminGetStatsApi,
  adminListUsersApi,
  adminResetPasswordApi,
  adminListWalletsApi,
  adminListAuditLogsApi,
  AdminStats,
} from '../api/admin';
import { User, Wallet, AuditLog } from '../types';

export const AdminPage: React.FC = () => {
  const [tab, setTab] = useState<number>(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
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
        const [statsData, usersData] = await Promise.all([
          adminGetStatsApi(),
          adminListUsersApi(50, 0),
        ]);
        setStats(statsData.stats);
        setUsers(usersData.users);
      } else if (tab === 1) {
        const walletsData = await adminListWalletsApi(50, 0);
        setWallets(walletsData.wallets);
      } else if (tab === 2) {
        const auditsData = await adminListAuditLogsApi({ limit: 50, offset: 0 });
        setAuditLogs(auditsData.audit_logs);
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

  return (
    <Layout>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Admin & System Control Panel
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Pemantauan sistem, audit log aktivitas, dan pengelolaan kredensial
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

      {/* Admin Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, val) => setTab(val)}>
          <Tab label="Pengguna (Users)" />
          <Tab label="Semua Buku (Wallets)" />
          <Tab label="Audit Logs" />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {tab === 0 && (
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

          {tab === 1 && (
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

          {tab === 2 && (
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
