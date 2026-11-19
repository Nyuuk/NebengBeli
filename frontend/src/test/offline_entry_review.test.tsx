import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OfflineEntryReviewPage } from '../pages/OfflineEntryReviewPage';

const mocks = vi.hoisted(() => ({
  getUnassignedOfflineEntries: vi.fn(), getPendingOfflineEntries: vi.fn(),
  assignOfflineEntryUser: vi.fn(), removePendingOfflineEntry: vi.fn(), syncOfflineQueue: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-current', username: 'current' } }) }));
vi.mock('../components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../offline/db', () => mocks);
vi.mock('../offline/sync', () => ({ syncOfflineQueue: mocks.syncOfflineQueue }));

const legacyEntry = {
  client_id: 'legacy-1', wallet_id: 'wallet-1', type: 'titipan' as const, amount: 12500,
  item_name: 'Kopi', note: 'Untuk rapat', occurred_at: '2024-03-20T10:00:00.000Z',
  created_at: '2024-03-20T10:00:00.000Z', retry_count: 0,
};

describe('OfflineEntryReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUnassignedOfflineEntries.mockResolvedValue([legacyEntry]);
    mocks.getPendingOfflineEntries.mockResolvedValue([]);
    mocks.assignOfflineEntryUser.mockResolvedValue(true);
    mocks.removePendingOfflineEntry.mockResolvedValue(true);
    mocks.syncOfflineQueue.mockResolvedValue({ synced: 1, failed: 0 });
  });
  const openPage = () => render(<MemoryRouter><OfflineEntryReviewPage /></MemoryRouter>);

  it('shows full payload and explicitly assigns only the chosen record to current user', async () => {
    openPage();
    expect(await screen.findByText(/Buku:/)).toBeInTheDocument();
    expect(screen.getByText(/wallet-1/)).toBeInTheDocument();
    expect(screen.getByText(/Kopi/)).toBeInTheDocument();
    expect(screen.getByText(/12.500/)).toBeInTheDocument();
    expect(screen.getByText(/Untuk rapat/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tetapkan ke akun saya' }));
    await waitFor(() => expect(mocks.assignOfflineEntryUser).toHaveBeenCalledWith('legacy-1', 'user-current'));
    expect(mocks.syncOfflineQueue).not.toHaveBeenCalled();
  });

  it('keeps an entry on cancel and deletes it only after explicit confirmation', async () => {
    openPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Buang entri' }));
    expect(screen.getByText(/dihapus permanen dari perangkat ini/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(mocks.removePendingOfflineEntry).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Buang entri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hapus permanen' }));
    await waitFor(() => expect(mocks.removePendingOfflineEntry).toHaveBeenCalledWith('legacy-1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the entry and confirmation open when removal fails', async () => {
    mocks.removePendingOfflineEntry.mockResolvedValue(false);
    openPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Buang entri' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hapus permanen' }));

    expect(await screen.findByText('Entri tidak dapat dibuang. Coba lagi.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Belum ditetapkan \(1\)/)).toBeInTheDocument();
    expect(mocks.getUnassignedOfflineEntries).toHaveBeenCalledTimes(1);
  });

  it('syncs only the user-assigned pending record set', async () => {
    mocks.getUnassignedOfflineEntries.mockResolvedValue([]);
    mocks.getPendingOfflineEntries.mockResolvedValue([{ ...legacyEntry, user_id: 'user-current' }]);
    openPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sinkronkan entri saya' }));
    await waitFor(() => expect(mocks.syncOfflineQueue).toHaveBeenCalledWith('user-current', undefined, true, ['legacy-1']));
    expect(screen.getByRole('button', { name: 'Kembali' })).toHaveStyle({ minHeight: '48px' });
  });
});
