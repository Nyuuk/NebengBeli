import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Menu,
  MenuItem,
  Chip,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ShareIcon from '@mui/icons-material/Share';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import EditIcon from '@mui/icons-material/Edit';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useParams, useNavigate } from 'react-router-dom';

import { Layout } from '../components/Layout';
import { BalanceCard, formatRupiah } from '../components/BalanceCard';
import { StatementView } from '../components/StatementView';
import { EntryModal } from '../components/EntryModal';
import { CorrectionModal } from '../components/CorrectionModal';
import { MoveEntryModal } from '../components/MoveEntryModal';
import { LinkWalletModal } from '../components/LinkWalletModal';
import { UnlinkWalletModal } from '../components/UnlinkWalletModal';
import { RekapTextModal } from '../components/RekapTextModal';

import { updateWalletNameApi, archiveWalletApi, unarchiveWalletApi, getWalletsApi } from '../api/wallets';
import { getStatementApi, getExportCSVUrl } from '../api/statements';
import {
  getPendingOfflineEntriesByWallet,
  setCachedStatement,
  getCachedStatement,
  removePendingOfflineEntry,
  moveFailedOfflineEntry,
  retryFailedOfflineEntry,
  getCachedWallets,
} from '../offline/db';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../context/OnlineStatusContext';
import { Wallet, Entry, StatementSummary } from '../types';

export const WalletDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline, refreshPendingCount, triggerSync } = useOnlineStatus();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [openEntryModal, setOpenEntryModal] = useState<boolean>(false);
  const [openCorrectionModal, setOpenCorrectionModal] = useState<boolean>(false);
  const [selectedEntryForCorrection, setSelectedEntryForCorrection] = useState<Entry | null>(null);
  const [openMoveModal, setOpenMoveModal] = useState<boolean>(false);
  const [selectedEntryForMove, setSelectedEntryForMove] = useState<Entry | null>(null);
  const [openLinkModal, setOpenLinkModal] = useState<boolean>(false);
  const [openUnlinkModal, setOpenUnlinkModal] = useState<boolean>(false);
  const [openRekapModal, setOpenRekapModal] = useState<boolean>(false);
  const [openRenameModal, setOpenRenameModal] = useState<boolean>(false);
  const [renameValue, setRenameValue] = useState<string>('');

  // Move failed entry dialog
  const [openMoveFailedModal, setOpenMoveFailedModal] = useState<boolean>(false);
  const [selectedFailedEntry, setSelectedFailedEntry] = useState<Entry | null>(null);
  const [availableTargetWallets, setAvailableTargetWallets] = useState<Wallet[]>([]);
  const [selectedTargetWalletId, setSelectedTargetWalletId] = useState<string>('');

  // Actions menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const fetchWalletData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch pending offline items from IndexedDB for this wallet
      const pending = await getPendingOfflineEntriesByWallet(id, user?.id);
      const pendingEntries: Entry[] = pending.map((p) => ({
        id: p.client_id,
        client_id: p.client_id,
        wallet_id: p.wallet_id,
        type: p.type,
        amount: p.amount,
        item_name: p.item_name,
        note: p.note,
        corrects_entry_id: p.corrects_entry_id,
        correction_reason: p.correction_reason,
        occurred_at: p.occurred_at,
        created_by: 'me',
        created_at: p.created_at,
        created_by_username: 'Anda (Offline)',
        is_offline_pending: p.status === 'pending' || !p.status,
        is_offline_failed: p.status === 'failed',
        offline_error: p.error_message,
      }));

      if (isOnline) {
        // Online: fetch fresh statement
        const stmt = await getStatementApi(id, { page, limit: 50 });
        setWallet(stmt.wallet);

        // Adjust summary with unsynced offline entries
        const pendingDelta = pendingEntries.reduce((sum, p) => sum + p.amount, 0);
        const adjustedSummary: StatementSummary = {
          ...stmt.summary,
          current_balance: (stmt.summary?.current_balance || 0) + pendingDelta,
          entry_count: (stmt.summary?.entry_count || 0) + pendingEntries.length,
        };
        setSummary(adjustedSummary);

        const stmtEntries = stmt?.entries || [];
        const stmtTotal = stmt?.total ?? 0;
        setEntries([...pendingEntries, ...stmtEntries]);
        setTotalEntries(stmtTotal + pendingEntries.length);
        setLastSyncedAt(new Date().toISOString());

        // Cache statement in IDB
        await setCachedStatement(id, {
          ...stmt,
          cached_at: new Date().toISOString(),
        }, user?.id);
      } else {
        // Offline: retrieve from cache
        const cached = await getCachedStatement(id, user?.id);
        if (cached?.data) {
          const cachedStmt = cached.data;
          setWallet(cachedStmt.wallet);

          const pendingDelta = pendingEntries.reduce((sum, p) => sum + p.amount, 0);
          setSummary({
            ...cachedStmt.summary,
            current_balance: (cachedStmt.summary?.current_balance || 0) + pendingDelta,
            entry_count: (cachedStmt.summary?.entry_count || 0) + pendingEntries.length,
          });

          setEntries([...pendingEntries, ...(cachedStmt.entries || [])]);
          setTotalEntries((cachedStmt.total || 0) + pendingEntries.length);
          setLastSyncedAt(cached.cached_at);
        } else {
          setError('Data buku ini belum tersedia secara offline.');
        }
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat data buku ledger.');
    } finally {
      setLoading(false);
    }
  }, [id, page, isOnline, user?.id]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  // Listen for sync completion event
  useEffect(() => {
    const handleSynced = () => {
      fetchWalletData();
    };
    window.addEventListener('nebengbeli:synced', handleSynced);
    return () => {
      window.removeEventListener('nebengbeli:synced', handleSynced);
    };
  }, [fetchWalletData]);

  const handleEntrySuccess = (newEntry: Entry, isOffline?: boolean) => {
    setEntries((prev) => [newEntry, ...prev]);
    setTotalEntries((prev) => prev + 1);
    if (summary) {
      setSummary({
        ...summary,
        current_balance: summary.current_balance + newEntry.amount,
        entry_count: summary.entry_count + 1,
        total_titipan: newEntry.type === 'titipan' ? summary.total_titipan + newEntry.amount : summary.total_titipan,
        total_topup: newEntry.type === 'topup' ? summary.total_topup + newEntry.amount : summary.total_topup,
        total_koreksi: newEntry.type === 'koreksi' ? summary.total_koreksi + newEntry.amount : summary.total_koreksi,
      });
    }
    if (!isOffline) {
      fetchWalletData();
    }
  };

  const handleDiscardFailedEntry = async (entry: Entry) => {
    const confirmDiscard = window.confirm(
      `Apakah Anda yakin ingin membuang entri "${entry.item_name}" yang gagal tersinkronisasi ini?`
    );
    if (!confirmDiscard) return;

    try {
      await removePendingOfflineEntry(entry.client_id);
      await refreshPendingCount();
      fetchWalletData();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal membuang entri offline.');
    }
  };

  const handleRetryFailedEntry = async (entry: Entry) => {
    try {
      await retryFailedOfflineEntry(entry.client_id);
      await refreshPendingCount();
      if (isOnline) {
        triggerSync();
      }
      fetchWalletData();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal menyetel ulang entri.');
    }
  };

  const handleOpenMoveFailedModal = async (entry: Entry) => {
    setSelectedFailedEntry(entry);
    try {
      let list: Wallet[] = [];
      if (isOnline) {
        list = await getWalletsApi(false);
      } else {
        const cached = await getCachedWallets('all', user?.id);
        list = cached?.wallets || [];
      }
      const valid = list.filter((w) => w.id !== id && !w.is_archived);
      setAvailableTargetWallets(valid);
      if (valid.length > 0) {
        setSelectedTargetWalletId(valid[0].id);
      }
      setOpenMoveFailedModal(true);
    } catch {
      setError('Gagal memuat daftar buku tujuan.');
    }
  };

  const handleConfirmMoveFailed = async () => {
    if (!selectedFailedEntry || !selectedTargetWalletId) return;

    try {
      // Moves the failed entry to the selected target wallet while preserving client_id and timestamps
      await moveFailedOfflineEntry(selectedFailedEntry.client_id, selectedTargetWalletId);
      await refreshPendingCount();
      setOpenMoveFailedModal(false);
      setSelectedFailedEntry(null);
      if (isOnline) {
        triggerSync();
      }
      fetchWalletData();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memindahkan entri offline.');
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !renameValue.trim()) return;

    try {
      await updateWalletNameApi(id, renameValue.trim());
      setOpenRenameModal(false);
      fetchWalletData();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal mengubah nama buku.');
    }
  };

  const handleToggleArchive = async () => {
    if (!id || !wallet) return;
    setMenuAnchor(null);

    if (!wallet.is_archived && wallet.balance !== 0) {
      const proceed = window.confirm(
        `Peringatan: Buku ini masih memiliki saldo ${formatRupiah(wallet.balance)}. Apakah Anda yakin ingin mengarsipkan buku bersaldo ini?`
      );
      if (!proceed) return;
    }

    try {
      if (wallet.is_archived) {
        await unarchiveWalletApi(id);
      } else {
        await archiveWalletApi(id);
      }
      fetchWalletData();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal mengubah status arsip.');
    }
  };

  const isCreator = Boolean(
    wallet && (wallet.creator_id === user?.id || wallet.user_role === 'creator' || wallet.user_role === 'both' || !wallet.user_role)
  );

  if (loading && !wallet) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  if (!wallet || !summary) {
    return (
      <Layout>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Buku ledger tidak ditemukan atau Anda tidak memiliki akses.'}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>
          Kembali ke Beranda
        </Button>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Header Bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => navigate('/')} sx={{ mr: 0.5 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {wallet.name}
              </Typography>
              {wallet.is_archived && (
                <Chip label="Diarsipkan" size="small" color="default" />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Pembuat: {wallet.creator_username || 'Anda'} {wallet.owner_username ? `• Rekan: @${wallet.owner_username}` : '• (Belum tertaut)'}
            </Typography>
            {lastSyncedAt && (
              <Typography variant="caption" color="text.secondary" display="block">
                Terakhir disinkron: {new Date(lastSyncedAt).toLocaleTimeString('id-ID')}
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip title="Refresh data">
            <IconButton onClick={fetchWalletData} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<TextSnippetIcon />}
            onClick={() => setOpenRekapModal(true)}
            sx={{ fontWeight: 600 }}
          >
            Rekap Teks
          </Button>

          {!wallet.is_archived && isCreator && (
            <>
              {!wallet.owner_username ? (
                <Button
                  variant="outlined"
                  startIcon={<ShareIcon />}
                  onClick={() => setOpenLinkModal(true)}
                  sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Tautkan
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<LinkOffIcon />}
                  onClick={() => setOpenUnlinkModal(true)}
                  sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Putus Tautan
                </Button>
              )}

              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenEntryModal(true)}
                sx={{ fontWeight: 700 }}
              >
                Catat Transaksi
              </Button>
            </>
          )}

          <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>

          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
          >
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenRekapModal(true); }}>
              <TextSnippetIcon fontSize="small" sx={{ mr: 1 }} /> Buat Rekap Teks (WA/Telegram)
            </MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); window.open(getExportCSVUrl(wallet.id), '_blank'); }}>
              <FileDownloadIcon fontSize="small" sx={{ mr: 1 }} /> Unduh CSV Laporan
            </MenuItem>
            {isCreator && (
              <>
                <MenuItem onClick={() => { setMenuAnchor(null); setRenameValue(wallet.name); setOpenRenameModal(true); }}>
                  <EditIcon fontSize="small" sx={{ mr: 1 }} /> Ganti Nama Buku
                </MenuItem>
                {!wallet.owner_username ? (
                  <MenuItem onClick={() => { setMenuAnchor(null); setOpenLinkModal(true); }}>
                    <ShareIcon fontSize="small" sx={{ mr: 1 }} /> Tautkan ke Rekan
                  </MenuItem>
                ) : (
                  <MenuItem onClick={() => { setMenuAnchor(null); setOpenUnlinkModal(true); }} sx={{ color: 'warning.main' }}>
                    <LinkOffIcon fontSize="small" sx={{ mr: 1 }} /> Putus Tautan Rekan
                  </MenuItem>
                )}
                <MenuItem onClick={handleToggleArchive} sx={{ color: wallet.is_archived ? 'primary.main' : 'error.main' }}>
                  {wallet.is_archived ? (
                    <>
                      <UnarchiveIcon fontSize="small" sx={{ mr: 1 }} /> Batalkan Arsip
                    </>
                  ) : (
                    <>
                      <ArchiveIcon fontSize="small" sx={{ mr: 1 }} /> Arsipkan Buku
                    </>
                  )}
                </MenuItem>
              </>
            )}
          </Menu>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Balance Summary Card */}
      <BalanceCard summary={summary} walletName={wallet.name} isArchived={wallet.is_archived} />

      {/* Statement Table Section */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Daftar Rekam Transaksi (Statement)
        </Typography>

        <Button
          size="small"
          startIcon={<FileDownloadIcon />}
          onClick={() => window.open(getExportCSVUrl(wallet.id), '_blank')}
        >
          Download CSV
        </Button>
      </Box>

      <StatementView
        entries={entries}
        totalCount={totalEntries}
        page={page}
        pageSize={50}
        onPageChange={(p) => setPage(p)}
        onCorrectEntry={(e) => {
          setSelectedEntryForCorrection(e);
          setOpenCorrectionModal(true);
        }}
        onMoveEntry={(e) => {
          setSelectedEntryForMove(e);
          setOpenMoveModal(true);
        }}
        onDiscardFailedEntry={handleDiscardFailedEntry}
        onMoveFailedEntry={handleOpenMoveFailedModal}
        onRetryFailedEntry={handleRetryFailedEntry}
        isArchivedWallet={wallet.is_archived}
      />

      {/* Modals */}
      <EntryModal
        open={openEntryModal}
        walletId={wallet.id}
        onClose={() => setOpenEntryModal(false)}
        onSuccess={handleEntrySuccess}
      />

      <CorrectionModal
        open={openCorrectionModal}
        walletId={wallet.id}
        targetEntry={selectedEntryForCorrection}
        onClose={() => setOpenCorrectionModal(false)}
        onSuccess={() => fetchWalletData()}
      />

      <MoveEntryModal
        open={openMoveModal}
        sourceWalletId={wallet.id}
        targetEntry={selectedEntryForMove}
        onClose={() => setOpenMoveModal(false)}
        onSuccess={() => fetchWalletData()}
      />

      <LinkWalletModal
        open={openLinkModal}
        walletId={wallet.id}
        walletName={wallet.name}
        onClose={() => setOpenLinkModal(false)}
        onSuccess={() => fetchWalletData()}
      />

      <UnlinkWalletModal
        open={openUnlinkModal}
        wallet={wallet}
        onClose={() => setOpenUnlinkModal(false)}
        onSuccess={() => fetchWalletData()}
      />

      <RekapTextModal
        open={openRekapModal}
        wallet={wallet}
        entries={entries}
        onClose={() => setOpenRekapModal(false)}
      />

      {/* Rename Dialog */}
      <Dialog open={openRenameModal} onClose={() => setOpenRenameModal(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleRename}>
          <DialogTitle sx={{ fontWeight: 700 }}>Ganti Nama Buku</DialogTitle>
          <DialogContent dividers>
            <TextField
              label="Nama Baru"
              fullWidth
              required
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenRenameModal(false)} color="inherit">
              Batal
            </Button>
            <Button type="submit" variant="contained">
              Simpan
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Move Failed Entry Dialog */}
      <Dialog open={openMoveFailedModal} onClose={() => setOpenMoveFailedModal(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Pindahkan Entri Gagal ke Buku Lain</DialogTitle>
        <DialogContent dividers>
          {selectedFailedEntry && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {selectedFailedEntry.item_name} ({formatRupiah(selectedFailedEntry.amount)})
              </Typography>
              <Typography variant="caption" color="error" display="block">
                Alasan gagal sebelumnya: {selectedFailedEntry.offline_error || 'Ditolak server'}
              </Typography>
            </Box>
          )}

          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="failed-move-target-label">Pilih Buku Tujuan</InputLabel>
            <Select
              labelId="failed-move-target-label"
              value={selectedTargetWalletId}
              label="Pilih Buku Tujuan"
              onChange={(e) => setSelectedTargetWalletId(e.target.value)}
            >
              {availableTargetWallets.map((w) => (
                <MenuItem key={w.id} value={w.id}>
                  {w.name} {w.owner_username ? `(@${w.owner_username})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenMoveFailedModal(false)} color="inherit">
            Batal
          </Button>
          <Button
            variant="contained"
            disabled={!selectedTargetWalletId || availableTargetWallets.length === 0}
            onClick={handleConfirmMoveFailed}
          >
            Pindahkan & Antrekan Ulang
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};
