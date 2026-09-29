import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Autocomplete,
  Alert,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import RestoreIcon from '@mui/icons-material/Restore';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import { v4 as uuidv4 } from 'uuid';

import { formatRupiah } from './BalanceCard';
import { batchCreateEntriesApi, createEntryApi } from '../api/entries';
import { getItemSuggestionsApi } from '../api/wallets';
import {
  queueOfflineEntry,
  saveShoppingDraft,
  getShoppingDraft,
  clearShoppingDraft,
  getCachedSuggestions,
  setCachedSuggestions,
} from '../offline/db';
import { useOnlineStatus } from '../context/OnlineStatusContext';
import { Wallet, ItemSuggestion, ShoppingSessionRow, BatchEntryItem } from '../types';

interface ShoppingSessionModalProps {
  open: boolean;
  wallets: Wallet[];
  onClose: () => void;
  onSuccess: (savedCount: number, isOffline?: boolean) => void;
}

const emptyRow = (): ShoppingSessionRow => ({
  rowId: uuidv4(),
  wallet_id: '',
  item_name: '',
  amount_str: '',
  amount: 0,
  note: '',
});

export const ShoppingSessionModal: React.FC<ShoppingSessionModalProps> = ({
  open,
  wallets,
  onClose,
  onSuccess,
}) => {
  const { isOnline, refreshPendingCount } = useOnlineStatus();
  const [rows, setRows] = useState<ShoppingSessionRow[]>([emptyRow(), emptyRow()]);
  const [occurredAt, setOccurredAt] = useState<string>(
    new Date().toISOString().substring(0, 16)
  );
  const [suggestionsMap, setSuggestionsMap] = useState<Record<string, ItemSuggestion[]>>({});
  const [hasDraftRestored, setHasDraftRestored] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active creator wallets sorted by recent
  const activeWallets = useMemo(() => {
    return (wallets || []).filter((w) => !w.is_archived && (w.user_role === 'creator' || w.user_role === 'both' || !w.user_role));
  }, [wallets]);

  // Load suggestions for a wallet
  const fetchSuggestions = useCallback(async (walletId: string) => {
    if (!walletId || suggestionsMap[walletId]) return;

    try {
      if (isOnline) {
        const list = await getItemSuggestionsApi(walletId);
        setSuggestionsMap((prev) => ({ ...prev, [walletId]: list }));
        await setCachedSuggestions(walletId, list);
      } else {
        const cached = await getCachedSuggestions(walletId);
        if (cached?.suggestions) {
          setSuggestionsMap((prev) => ({ ...prev, [walletId]: cached.suggestions }));
        }
      }
    } catch {
      // Ignore failure, allow free text
    }
  }, [isOnline, suggestionsMap]);

  // Restore draft when opened
  useEffect(() => {
    if (open) {
      getShoppingDraft().then((draft) => {
        if (draft && draft.rows && draft.rows.length > 0) {
          setRows(draft.rows);
          if (draft.occurred_at) {
            setOccurredAt(draft.occurred_at);
          }
          setHasDraftRestored(true);
          // Pre-fetch suggestions for used wallets
          draft.rows.forEach((r) => {
            if (r.wallet_id) fetchSuggestions(r.wallet_id);
          });
        }
      });
    }
  }, [open, fetchSuggestions]);

  // Autosave draft on change
  useEffect(() => {
    if (!open) return;
    const hasAnyContent = rows.some((r) => r.wallet_id || r.item_name || r.amount_str);
    if (hasAnyContent) {
      saveShoppingDraft({
        rows,
        occurred_at: occurredAt,
        saved_at: new Date().toISOString(),
      });
    }
  }, [rows, occurredAt, open]);

  const handleAddRow = () => {
    setRows((prev) => [...prev, emptyRow()]);
  };

  const handleDeleteRow = (index: number) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [emptyRow()];
    });
  };

  const handleRowChange = (index: number, field: keyof ShoppingSessionRow, value: string | number) => {
    setRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      if (field === 'amount_str') {
        const parsed = parseInt((value as string).replace(/[^0-9]/g, ''), 10) || 0;
        row.amount = parsed;
      }

      if (field === 'wallet_id') {
        const wId = value as string;
        if (wId) fetchSuggestions(wId);
      }

      updated[index] = row;
      return updated;
    });
  };

  const handleSuggestionSelect = (index: number, suggestion: ItemSuggestion | null) => {
    if (!suggestion) return;
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        item_name: suggestion.item_name,
        amount_str: suggestion.last_price ? suggestion.last_price.toString() : updated[index].amount_str,
        amount: suggestion.last_price || updated[index].amount,
      };
      return updated;
    });
  };

  const handleClearDraft = async () => {
    await clearShoppingDraft();
    setRows([emptyRow(), emptyRow()]);
    setHasDraftRestored(false);
  };

  const totalAmount = useMemo(() => {
    return rows.reduce((sum, r) => sum + (r.amount || 0), 0);
  }, [rows]);

  const validRows = useMemo(() => {
    return rows.filter((r) => r.wallet_id && r.item_name.trim() && r.amount > 0);
  }, [rows]);

  const handleSaveAll = async () => {
    setError(null);
    if (validRows.length === 0) {
      setError('Mohon isi minimal 1 baris titipan dengan buku, nama item, dan nominal yang valid.');
      return;
    }

    setIsSubmitting(true);
    const occurredDateISO = occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString();

    const batchPayload: BatchEntryItem[] = validRows.map((r) => ({
      client_id: uuidv4(),
      wallet_id: r.wallet_id,
      type: 'titipan',
      amount: r.amount,
      item_name: r.item_name.trim(),
      note: r.note.trim(),
      occurred_at: occurredDateISO,
    }));

    if (!isOnline) {
      // Offline mode: Store all rows in IndexedDB
      try {
        const now = new Date().toISOString();
        for (const item of batchPayload) {
          await queueOfflineEntry({
            client_id: item.client_id,
            wallet_id: item.wallet_id,
            type: 'titipan',
            amount: item.amount,
            item_name: item.item_name,
            note: item.note || '',
            occurred_at: item.occurred_at || now,
            created_at: now,
            retry_count: 0,
          });
        }
        await refreshPendingCount();
        await clearShoppingDraft();
        onSuccess(batchPayload.length, true);
        onClose();
      } catch {
        setError('Gagal menyimpan entri ke memori lokal.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Online mode: Call Batch API with fallback
    try {
      try {
        await batchCreateEntriesApi(batchPayload);
      } catch {
        // Fallback: sequential create
        for (const item of batchPayload) {
          await createEntryApi(item.wallet_id, {
            client_id: item.client_id,
            type: 'titipan',
            amount: item.amount,
            item_name: item.item_name,
            note: item.note,
            occurred_at: item.occurred_at,
          });
        }
      }

      await clearShoppingDraft();
      onSuccess(batchPayload.length, false);
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal menyimpan transaksi belanja.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShoppingBagIcon color="primary" /> Sesi Belanja (Catat Banyak Titipan Sekaligus)
        </Box>
        {hasDraftRestored && (
          <Chip
            icon={<RestoreIcon />}
            label="Draft Tersimpan Dipulihkan"
            size="small"
            color="info"
            onDelete={handleClearDraft}
          />
        )}
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!isOnline && (
          <Alert severity="info" icon={<CloudOffIcon />} sx={{ mb: 2 }}>
            Mode offline: Seluruh transaksi akan disimpan secara lokal dan disinkronkan saat terhubung internet.
          </Alert>
        )}

        {/* Top Controls: Date and Time */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
          <TextField
            label="Waktu Belanja"
            type="datetime-local"
            size="small"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 240 }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Total Belanja ({validRows.length} item):
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main' }}>
              {formatRupiah(totalAmount)}
            </Typography>
          </Box>
        </Box>

        {/* Multi-row Table */}
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, mb: 2 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f1f5f9' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '28%' }}>Buku / Teman</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '32%' }}>Barang / Titipan</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '22%' }}>Harga (Rp)</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '12%' }}>Catatan</TableCell>
                <TableCell align="center" sx={{ width: '6%' }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => {
                const selectedWallet = activeWallets.find((w) => w.id === row.wallet_id) || null;
                const suggestions = suggestionsMap[row.wallet_id] || [];

                return (
                  <TableRow key={row.rowId}>
                    {/* 1. Wallet Autocomplete */}
                    <TableCell>
                      <Autocomplete
                        size="small"
                        options={activeWallets}
                        getOptionLabel={(opt) =>
                          `${opt.name}${opt.owner_username ? ` (@${opt.owner_username})` : ''}`
                        }
                        value={selectedWallet}
                        onChange={(_, opt) => handleRowChange(idx, 'wallet_id', opt ? opt.id : '')}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Pilih buku..."
                            required
                          />
                        )}
                      />
                    </TableCell>

                    {/* 2. Item Name Autocomplete with Suggestions */}
                    <TableCell>
                      <Autocomplete
                        size="small"
                        freeSolo
                        options={suggestions}
                        getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.item_name)}
                        value={row.item_name}
                        onInputChange={(_, val) => handleRowChange(idx, 'item_name', val)}
                        onChange={(_, val) => {
                          if (typeof val === 'object' && val) {
                            handleSuggestionSelect(idx, val);
                          }
                        }}
                        renderOption={(props, option) => (
                          <li {...props} key={option.item_name}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <Typography variant="body2">{option.item_name}</Typography>
                              {option.last_price > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  {formatRupiah(option.last_price)}
                                </Typography>
                              )}
                            </Box>
                          </li>
                        )}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Contoh: Kopi Susu"
                            required
                          />
                        )}
                      />
                    </TableCell>

                    {/* 3. Amount */}
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="0"
                        value={row.amount_str}
                        onChange={(e) => handleRowChange(idx, 'amount_str', e.target.value)}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">Rp</InputAdornment>,
                        }}
                      />
                    </TableCell>

                    {/* 4. Note */}
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Opsional"
                        value={row.note}
                        onChange={(e) => handleRowChange(idx, 'note', e.target.value)}
                      />
                    </TableCell>

                    {/* 5. Delete Action */}
                    <TableCell align="center">
                      <Tooltip title="Hapus baris">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={rows.length === 1}
                            onClick={() => handleDeleteRow(idx)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddRow}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Tambah Baris Titipan
        </Button>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose} color="inherit" disabled={isSubmitting}>
          Batal
        </Button>
        <Button
          variant="contained"
          size="large"
          disabled={isSubmitting || validRows.length === 0}
          onClick={handleSaveAll}
          sx={{ px: 4, fontWeight: 800 }}
        >
          {isSubmitting
            ? 'Menyimpan...'
            : `Simpan Semua (${validRows.length} Titipan - ${formatRupiah(totalAmount)})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
