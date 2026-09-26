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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ShareIcon from '@mui/icons-material/Share';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import EditIcon from '@mui/icons-material/Edit';
import { useParams, useNavigate } from 'react-router-dom';

import { Layout } from '../components/Layout';
import { BalanceCard } from '../components/BalanceCard';
import { StatementView } from '../components/StatementView';
import { EntryModal } from '../components/EntryModal';
import { CorrectionModal } from '../components/CorrectionModal';
import { MoveEntryModal } from '../components/MoveEntryModal';
import { LinkWalletModal } from '../components/LinkWalletModal';

import { updateWalletNameApi, archiveWalletApi, unarchiveWalletApi } from '../api/wallets';
import { getStatementApi, getExportCSVUrl } from '../api/statements';
import { getPendingOfflineEntriesByWallet } from '../offline/db';
import { Wallet, Entry, StatementSummary } from '../types';

export const WalletDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totalEntries, setTotalEntries] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [openEntryModal, setOpenEntryModal] = useState<boolean>(false);
  const [openCorrectionModal, setOpenCorrectionModal] = useState<boolean>(false);
  const [selectedEntryForCorrection, setSelectedEntryForCorrection] = useState<Entry | null>(null);
  const [openMoveModal, setOpenMoveModal] = useState<boolean>(false);
  const [selectedEntryForMove, setSelectedEntryForMove] = useState<Entry | null>(null);
  const [openLinkModal, setOpenLinkModal] = useState<boolean>(false);
  const [openRenameModal, setOpenRenameModal] = useState<boolean>(false);
  const [renameValue, setRenameValue] = useState<string>('');

  // Actions menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const fetchWalletData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch statement & wallet details
      const stmt = await getStatementApi(id, { page, limit: 25 });
      setWallet(stmt.wallet);
      setSummary(stmt.summary);

      // 2. Fetch pending offline items from IndexedDB for this wallet
      const pending = await getPendingOfflineEntriesByWallet(id);
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
        is_offline_pending: true,
      }));

      // Merge pending offline entries at the top
      setEntries([...pendingEntries, ...stmt.entries]);
      setTotalEntries(stmt.total + pendingEntries.length);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat data buku ledger.');
    } finally {
      setLoading(false);
    }
  }, [id, page]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const handleEntrySuccess = (newEntry: Entry, isOffline?: boolean) => {
    // Optimistic update
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => navigate('/')} sx={{ mr: 0.5 }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
              {wallet.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Pembuat: {wallet.creator_username} {wallet.owner_username ? `• Rekan: ${wallet.owner_username}` : '• (Belum tertaut)'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {!wallet.is_archived && (
            <>
              <Button
                variant="outlined"
                startIcon={<ShareIcon />}
                onClick={() => setOpenLinkModal(true)}
                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
              >
                Tautkan
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpenEntryModal(true)}
                sx={{ fontWeight: 700 }}
              >
                Tambah Entri
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
            <MenuItem onClick={() => { setMenuAnchor(null); setRenameValue(wallet.name); setOpenRenameModal(true); }}>
              <EditIcon fontSize="small" sx={{ mr: 1 }} /> Ganti Nama Buku
            </MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); window.open(getExportCSVUrl(wallet.id), '_blank'); }}>
              <FileDownloadIcon fontSize="small" sx={{ mr: 1 }} /> Ekspor Laporan CSV
            </MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setOpenLinkModal(true); }}>
              <ShareIcon fontSize="small" sx={{ mr: 1 }} /> Tautkan ke Rekan
            </MenuItem>
            <MenuItem onClick={handleToggleArchive} sx={{ color: wallet.is_archived ? 'primary.main' : 'warning.main' }}>
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
        pageSize={25}
        onPageChange={(p) => setPage(p)}
        onCorrectEntry={(e) => {
          setSelectedEntryForCorrection(e);
          setOpenCorrectionModal(true);
        }}
        onMoveEntry={(e) => {
          setSelectedEntryForMove(e);
          setOpenMoveModal(true);
        }}
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
    </Layout>
  );
};
