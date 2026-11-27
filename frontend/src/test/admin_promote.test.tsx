import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AdminPage } from '../pages/AdminPage';
import * as adminApi from '../api/admin';
import * as client from '../api/client';
import { User } from '../types';

vi.mock('../components/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const target: User = { id: 'target-id', username: 'target', role: 'user', token_version: 1, created_at: '2026-01-01T00:00:00Z' };
const admin: User = { ...target, id: 'admin-id', username: 'existing-admin', role: 'admin' };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(adminApi, 'adminGetStatsApi').mockResolvedValue({ stats: { total_users: 2, total_wallets: 0, active_wallets: 0, archived_wallets: 0, total_entries: 0, total_volume: 0, total_audit_logs: 0 } });
  vi.spyOn(adminApi, 'adminListUsersApi').mockResolvedValue({ users: [target, admin], total: 2 });
});

async function openDialog() {
  render(<AdminPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Promosikan ke Admin' }));
  return screen.findByRole('dialog', { name: 'Promosikan Pengguna ke Admin?' });
}

describe('Admin promotion', () => {
  it('posts to the promotion endpoint', async () => {
    const request = vi.spyOn(client, 'request').mockResolvedValue({ message: 'ok', user: { ...target, role: 'admin' } });
    await adminApi.adminPromoteUserApi(target.id);
    expect(request).toHaveBeenCalledWith('/api/admin/users/target-id/promote', { method: 'POST' });
  });

  it('only offers promotion for normal users; cancel never calls API', async () => {
    const promote = vi.spyOn(adminApi, 'adminPromoteUserApi');
    const dialog = await openDialog();
    const rows = screen.getAllByRole('row', { hidden: true });
    expect(within(rows.find(row => row.textContent?.includes('existing-admin'))!).queryByText('Promosikan ke Admin')).not.toBeInTheDocument();
    expect(within(dialog).getByText('target')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('seluruh akses admin');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(promote).not.toHaveBeenCalled();
  });

  it('requires confirmation, disables controls while pending, refreshes role on success', async () => {
    let finish!: (value: { message: string; user: User }) => void;
    const promote = vi.spyOn(adminApi, 'adminPromoteUserApi').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const dialog = await openDialog();
    expect(promote).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ya, Promosikan' }));
    expect(promote).toHaveBeenCalledWith(target.id);
    expect(within(dialog).getByRole('button', { name: 'Memproses...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Batal' })).toBeDisabled();
    vi.mocked(adminApi.adminListUsersApi).mockResolvedValue({ users: [{ ...target, role: 'admin' }, admin], total: 2 });
    finish({ message: 'ok', user: { ...target, role: 'admin' } });
    expect(await screen.findByText("Pengguna 'target' berhasil dipromosikan menjadi admin.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Promosikan ke Admin' })).not.toBeInTheDocument());
    expect(adminApi.adminListUsersApi).toHaveBeenCalledTimes(2);
    expect(within(screen.getAllByRole('row').find(row => row.textContent?.includes('target'))!).getByText('admin')).toBeInTheDocument();
  });

  it('shows API error and allows retry without closing dialog', async () => {
    vi.spyOn(adminApi, 'adminPromoteUserApi').mockRejectedValue(new Error('User sudah admin'));
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ya, Promosikan' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('User sudah admin');
    expect(within(dialog).getByRole('button', { name: 'Ya, Promosikan' })).toBeEnabled();
    expect(adminApi.adminListUsersApi).toHaveBeenCalledTimes(1);
  });
});
