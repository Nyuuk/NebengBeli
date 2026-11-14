import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tab } from '@mui/material';
import { ResponsiveTabs } from '../components/ResponsiveTabs';
import { RekapTextModal } from '../components/RekapTextModal';

function ControlledTabs() {
  const [value, setValue] = useState('today');
  return <ResponsiveTabs aria-label="Periode" value={value} onChange={(_, next) => setValue(next)}>
    <Tab value="today" label="Hari Ini" />
    <Tab value="custom" label="Custom" />
  </ResponsiveTabs>;
}

const wallet = { id: 'local', name: 'Local', creator_id: 'creator', balance: 0,
  entry_count: 0, is_archived: false, created_at: '2026-01-01T00:00:00Z' };

afterEach(() => vi.restoreAllMocks());

describe('Recap actions', () => {
  function renderRecap() {
    const onClose = vi.fn();
    render(<RekapTextModal open wallet={wallet} entries={[]} onClose={onClose} />);
    return onClose;
  }

  it('closes using Tutup', () => {
    const onClose = renderRecap();
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('copies recap text and reports success without using the real clipboard', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderRecap();
    fireEvent.click(screen.getByRole('button', { name: 'Salin Teks' }));
    expect(await screen.findByText('Teks rekap berhasil disalin ke clipboard!')).toBeVisible();
    expect(copy).toHaveBeenCalledWith(expect.stringContaining('REKAP BUKU TITIPAN — LOCAL'));
  });

  it('reports the manual-copy fallback on clipboard failure', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('local denial'));
    renderRecap();
    fireEvent.click(screen.getByRole('button', { name: 'Salin Teks' }));
    expect(await screen.findByText('Gagal menyalin otomatis, silakan blok dan salin teks secara manual.')).toBeVisible();
  });

  it('shares recap text successfully without invoking external share', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    renderRecap();
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan' }));
    expect(share).toHaveBeenCalledWith({ title: 'Rekap NebengBeli - Local', text: expect.stringContaining('REKAP BUKU TITIPAN — LOCAL') });
    delete (navigator as Partial<Navigator>).share;
  });

  it('uses local share and silently preserves share cancellation', async () => {
    const share = vi.fn().mockRejectedValue(new Error('local cancellation'));
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    renderRecap();
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan' }));
    expect(share).toHaveBeenCalledWith({ title: 'Rekap NebengBeli - Local', text: expect.stringContaining('REKAP BUKU TITIPAN — LOCAL') });
    expect(screen.queryByText('Teks rekap berhasil disalin ke clipboard!')).not.toBeInTheDocument();
    delete (navigator as Partial<Navigator>).share;
  });

  it('falls back to copy when native share is unavailable', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderRecap();
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan' }));
    expect(await screen.findByText('Teks rekap berhasil disalin ke clipboard!')).toBeVisible();
    expect(copy).toHaveBeenCalledOnce();
    delete (navigator as Partial<Navigator>).share;
  });
});

describe('Responsive horizontal tabs', () => {
  it('preserves explicit values, manual keyboard selection, roles and focus', () => {
    render(<ControlledTabs />);
    const today = screen.getByRole('tab', { name: 'Hari Ini' });
    const custom = screen.getByRole('tab', { name: 'Custom' });
    today.focus();
    fireEvent.keyDown(today, { key: 'ArrowRight' });
    expect(custom).toHaveFocus();
    expect(today).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(custom);
    expect(custom).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tablist', { name: 'Periode' })).toBeInTheDocument();
  });

  it('keeps recap Custom dates editable and restores preset content', () => {
    render(<RekapTextModal open wallet={{ id: 'local', name: 'Local', creator_id: 'creator',
      balance: 0, entry_count: 0, is_archived: false, created_at: '2026-01-01T00:00:00Z' }}
      entries={[{ id: 'entry', client_id: 'entry', wallet_id: 'local', type: 'topup', amount: 1000,
        item_name: 'Local filtered entry', note: '', occurred_at: '2026-01-02T12:00:00Z',
        created_at: '2026-01-02T12:00:00Z', created_by: 'creator' }]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    const start = screen.getByLabelText('Tanggal Mulai');
    fireEvent.change(start, { target: { value: '2026-01-01' } });
    expect(start).toHaveValue('2026-01-01');
    const end = screen.getByLabelText('Tanggal Selesai');
    fireEvent.change(end, { target: { value: '2026-01-03' } });
    expect(end).toHaveValue('2026-01-03');
    expect(screen.getByText(/Transaksi: 1 entri/)).toBeVisible();
    fireEvent.change(start, { target: { value: '2026-01-03' } });
    expect(screen.getByText(/Transaksi: 0 entri/)).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: 'Hari Ini' }));
    expect(screen.queryByLabelText('Tanggal Mulai')).not.toBeInTheDocument();
  });
});
