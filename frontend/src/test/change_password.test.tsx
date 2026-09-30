import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChangePasswordPage } from '../pages/ChangePasswordPage';
import { AuthProvider } from '../context/AuthContext';
import { OnlineStatusProvider } from '../context/OnlineStatusContext';
import * as authApi from '../api/auth';
import { setSimulatedOffline } from '../offline/networkMode';

describe('F10: Self-Service Authenticated Password Change UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setSimulatedOffline(false);
    // Mock getMeApi so AuthProvider loads with an authenticated user
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({
      user: {
        id: 'user-uuid-1',
        username: 'adnan_tester',
        role: 'user',
        created_at: new Date().toISOString(),
      },
    });
  });

  const renderComponent = () =>
    render(
      <MemoryRouter initialEntries={['/change-password']}>
        <AuthProvider>
          <OnlineStatusProvider>
            <ChangePasswordPage />
          </OnlineStatusProvider>
        </AuthProvider>
      </MemoryRouter>
    );

  it('renders password change form with all required fields', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Ganti Kata Sandi/i })).toBeDefined();
    });

    expect(screen.getByLabelText(/Kata Sandi Saat Ini/i)).toBeDefined();
    expect(screen.getByLabelText(/^Kata Sandi Baru/i)).toBeDefined();
    expect(screen.getByLabelText(/Konfirmasi Kata Sandi Baru/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Simpan Kata Sandi/i })).toBeDefined();
  });

  it('validates password mismatch on client-side before API call', async () => {
    const changeSpy = vi.spyOn(authApi, 'changePasswordApi');
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText(/Kata Sandi Saat Ini/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Kata Sandi Saat Ini/i), {
      target: { value: 'CurrentPass123!' },
    });
    fireEvent.change(screen.getByLabelText(/^Kata Sandi Baru/i), {
      target: { value: 'NewPass123!' },
    });
    fireEvent.change(screen.getByLabelText(/Konfirmasi Kata Sandi Baru/i), {
      target: { value: 'DifferentPass456!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan Kata Sandi/i }));

    await waitFor(() => {
      expect(screen.getByText(/Konfirmasi kata sandi baru tidak cocok/i)).toBeDefined();
    });
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('validates minimum password length of 6 characters', async () => {
    const changeSpy = vi.spyOn(authApi, 'changePasswordApi');
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText(/Kata Sandi Saat Ini/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Kata Sandi Saat Ini/i), {
      target: { value: 'CurrentPass123!' },
    });
    fireEvent.change(screen.getByLabelText(/^Kata Sandi Baru/i), {
      target: { value: '123' },
    });
    fireEvent.change(screen.getByLabelText(/Konfirmasi Kata Sandi Baru/i), {
      target: { value: '123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan Kata Sandi/i }));

    await waitFor(() => {
      expect(screen.getByText(/Kata sandi baru minimal harus 6 karakter/i)).toBeDefined();
    });
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it('submits valid password change and displays success feedback', async () => {
    const changeSpy = vi.spyOn(authApi, 'changePasswordApi').mockResolvedValue({
      message: 'Kata sandi berhasil diubah! Sesi Anda telah direset.',
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText(/Kata Sandi Saat Ini/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Kata Sandi Saat Ini/i), {
      target: { value: 'CurrentSecret123!' },
    });
    fireEvent.change(screen.getByLabelText(/^Kata Sandi Baru/i), {
      target: { value: 'NewSecretPass456!' },
    });
    fireEvent.change(screen.getByLabelText(/Konfirmasi Kata Sandi Baru/i), {
      target: { value: 'NewSecretPass456!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan Kata Sandi/i }));

    await waitFor(() => {
      expect(changeSpy).toHaveBeenCalledWith('CurrentSecret123!', 'NewSecretPass456!');
      expect(screen.getByText(/Kata sandi berhasil diubah!/i)).toBeDefined();
    });
  });

  it('handles API error rejection gracefully', async () => {
    vi.spyOn(authApi, 'changePasswordApi').mockRejectedValue({
      message: 'kata sandi saat ini salah',
    });
    renderComponent();

    await waitFor(() => {
      expect(screen.getByLabelText(/Kata Sandi Saat Ini/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Kata Sandi Saat Ini/i), {
      target: { value: 'WrongPassword!' },
    });
    fireEvent.change(screen.getByLabelText(/^Kata Sandi Baru/i), {
      target: { value: 'NewSecretPass456!' },
    });
    fireEvent.change(screen.getByLabelText(/Konfirmasi Kata Sandi Baru/i), {
      target: { value: 'NewSecretPass456!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Simpan Kata Sandi/i }));

    await waitFor(() => {
      expect(screen.getByText(/kata sandi saat ini salah/i)).toBeDefined();
    });
  });

  it('displays warning and prevents submit when offline', async () => {
    setSimulatedOffline(true);
    renderComponent();

    await waitFor(() => {
      const offlineAlerts = screen.getAllByText(/Anda sedang offline/i);
      expect(offlineAlerts.length).toBeGreaterThan(0);
    });

    const submitBtn = screen.getByRole('button', { name: /Simpan Kata Sandi/i });
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
  });
});
