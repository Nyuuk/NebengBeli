import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import {
  assignOfflineEntryUser, getPendingOfflineEntries, getUnassignedOfflineEntries,
  removePendingOfflineEntry,
} from '../offline/db';
import { syncOfflineQueue } from '../offline/sync';
import { PendingOfflineEntry } from '../types';

export const OfflineEntryReviewPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unassigned, setUnassigned] = useState<PendingOfflineEntry[]>([]);
  const [assigned, setAssigned] = useState<PendingOfflineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [discardTarget, setDiscardTarget] = useState<PendingOfflineEntry | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError('');
    try {
      const [legacy, owned] = await Promise.all([
        getUnassignedOfflineEntries(), getPendingOfflineEntries(user.id),
      ]);
      setUnassigned(legacy);
      setAssigned(owned);
    } catch {
      setError('Entri offline tidak dapat dimuat. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const assign = async (entry: PendingOfflineEntry) => {
    if (!user?.id) return;
    setBusyId(entry.client_id);
    setError('');
    try {
      const success = await assignOfflineEntryUser(entry.client_id, user.id);
      if (!success) throw new Error('Entri tidak dapat ditetapkan.');
      await refresh();
    } catch {
      setError('Entri tidak dapat ditetapkan. Coba muat ulang.');
    } finally { setBusyId(''); }
  };

  const discard = async () => {
    if (!discardTarget) return;
    const id = discardTarget.client_id;
    setBusyId(id);
    try {
      const removed = await removePendingOfflineEntry(id);
      if (!removed) {
        setError('Entri tidak dapat dibuang. Coba lagi.');
        return;
      }
      setDiscardTarget(null);
      await refresh();
    } catch {
      setError('Entri tidak dapat dibuang. Coba lagi.');
    } finally { setBusyId(''); }
  };

  const syncAssigned = async () => {
    if (!user?.id || !assigned.length) return;
    setSyncing(true);
    setError('');
    try {
      await syncOfflineQueue(user.id, undefined, true, assigned.map((entry) => entry.client_id));
      await refresh();
    } catch {
      setError('Sinkronisasi gagal. Entri tetap tersimpan; coba lagi.');
    } finally { setSyncing(false); }
  };

  const renderDetails = (entry: PendingOfflineEntry) => (
    <Stack spacing={0.5}>
      <Typography variant="body2"><strong>Tanggal:</strong> {new Date(entry.occurred_at || entry.created_at).toLocaleString()}</Typography>
      <Typography variant="body2"><strong>Buku:</strong> {entry.wallet_id}</Typography>
      <Typography variant="body2"><strong>Item:</strong> {entry.item_name || '—'}</Typography>
      <Typography variant="body2"><strong>Jumlah:</strong> Rp {Number(entry.amount).toLocaleString('id-ID')}</Typography>
      <Typography variant="body2"><strong>Catatan:</strong> {entry.note || '—'}</Typography>
    </Stack>
  );

  const entryCard = (entry: PendingOfflineEntry, mode: 'unassigned' | 'assigned') => (
    <Card key={entry.client_id} variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        {renderDetails(entry)}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
          {mode === 'unassigned' ? <>
            <Button fullWidth variant="contained" disabled={busyId === entry.client_id} onClick={() => void assign(entry)} sx={{ minHeight: 48 }}>
              Tetapkan ke akun saya
            </Button>
            <Button fullWidth color="error" variant="outlined" disabled={busyId === entry.client_id} onClick={() => setDiscardTarget(entry)} sx={{ minHeight: 48 }}>
              Buang entri
            </Button>
          </> : <Typography color="success.main" role="status">Ditugaskan ke akun Anda</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );

  return <Layout>
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <Typography variant="h5" component="h1" fontWeight={700} gutterBottom>Review entri offline</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>Entri tanpa pemilik tidak akan disinkronkan sampai Anda menetapkannya secara eksplisit.</Typography>
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => void refresh()}>Coba lagi</Button>} sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <Box role="status" aria-label="Memuat entri offline" sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box> : <>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Belum ditetapkan ({unassigned.length})</Typography>
        {unassigned.length ? <Stack spacing={1.5} sx={{ mb: 3 }}>{unassigned.map((entry) => entryCard(entry, 'unassigned'))}</Stack> : <Alert severity="info" sx={{ mb: 3 }}>Tidak ada entri tanpa pemilik.</Alert>}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
          <Typography variant="h6" component="h2">Entri akun Anda ({assigned.length})</Typography>
          <Button variant="contained" onClick={() => void syncAssigned()} disabled={!assigned.length || syncing} sx={{ minHeight: 48, flexShrink: 0 }}>
            {syncing ? 'Menyinkronkan…' : 'Sinkronkan entri saya'}
          </Button>
        </Box>
        {assigned.length ? <Stack spacing={1.5}>{assigned.map((entry) => entryCard(entry, 'assigned'))}</Stack> : <Alert severity="info">Belum ada entri yang ditetapkan untuk akun Anda.</Alert>}
      </>}
      <Button onClick={() => navigate(-1)} sx={{ mt: 2, minHeight: 48 }}>Kembali</Button>
    </Box>
    <Dialog open={Boolean(discardTarget)} onClose={() => setDiscardTarget(null)} aria-labelledby="discard-title">
      <DialogTitle id="discard-title">Buang entri offline?</DialogTitle>
      <DialogContent>Entri ini akan dihapus permanen dari perangkat ini. Tidak ada perubahan atau permintaan yang dikirim ke server. Tindakan ini tidak dapat dibatalkan.</DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', p: 2 }}>
        <Button onClick={() => setDiscardTarget(null)} sx={{ minHeight: 48 }}>Batal</Button>
        <Button color="error" variant="contained" onClick={() => void discard()} disabled={Boolean(busyId)} sx={{ minHeight: 48 }}>Hapus permanen</Button>
      </DialogActions>
    </Dialog>
  </Layout>;
};

export default OfflineEntryReviewPage;
