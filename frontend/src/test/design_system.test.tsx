import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { BalanceCard } from '../components/BalanceCard';
import { LoginPage } from '../pages/LoginPage';
import { ShoppingSessionModal } from '../components/ShoppingSessionModal';
import { TablePaginationBar } from '../components/TablePaginationBar';
import { LinkRequestsPage } from '../pages/LinkRequestsPage';
import { MemoryRouter } from 'react-router-dom';
import { appTheme } from '../theme';

vi.mock('../context/OnlineStatusContext', () => ({
  useOnlineStatus: () => ({ isOnline: true, pendingCount: 0, isSyncing: false, syncNow: vi.fn(), refreshPendingCount: vi.fn() }),
  OnlineStatusProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../context/AuthContext', () => {
  const auth = { user: null, login: vi.fn() };
  return { useAuth: () => auth };
});
vi.mock('../api', () => ({ api: { get: vi.fn().mockResolvedValue([]) } }));

afterEach(() => vi.restoreAllMocks());

describe('design system', () => {
  it('defines expected app theme tokens', () => {
    expect(appTheme.palette.background.default).toBe('#f8fafc');
    expect(appTheme.palette.text.primary).toBe('#1e293b');
    expect(appTheme.shape.borderRadius).toBe(8);
    expect(appTheme.palette.grey[100]).toBe('#f1f5f9');
  });

  it.each([
    [100, 'Kelebihan Bayar / Saldo Positif'],
    [-100, 'Total Tagihan Belum Dibayar'],
    [0, 'Lunas / Seimbang'],
  ])('renders BalanceCard status for balance %s', (balance, label) => {
    render(<BalanceCard summary={{ current_balance: balance, total_titipan: 0, total_topup: 0, total_koreksi: 0, entry_count: 0 }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders accessible pagination controls', () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    render(<TablePaginationBar page={1} pageSize={10} total={21} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />);
    expect(screen.getByText('Menampilkan 1–10 dari 21')).toBeInTheDocument();
    expect(screen.getByLabelText('Baris per halaman')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByLabelText('Baris per halaman'), { target: { value: '25' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('renders exactly one h1 and one h2 on login', () => {
    render(<MemoryRouter><ThemeProvider theme={appTheme}><LoginPage /></ThemeProvider></MemoryRouter>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });

  it('renders shopping modal fullscreen on mobile', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: true, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    render(<ThemeProvider theme={appTheme}><ShoppingSessionModal open wallets={[]} onClose={() => {}} onSuccess={() => {}} /></ThemeProvider>);
    expect(document.querySelector('.MuiDialog-paperFullScreen')).toBeInTheDocument();
  });

  it('renders semantic page heading', async () => {
    render(<MemoryRouter><ThemeProvider theme={appTheme}><LinkRequestsPage /></ThemeProvider></MemoryRouter>);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
