import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClaimUsernameModal } from '../components/ClaimUsernameModal';
import { AuthProvider } from '../context/AuthContext';
import * as authApi from '../api/auth';
import { User } from '../types';

describe('Cara C: ClaimUsernameModal (Self-Service Username Claim/Update on Login)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderModal = () =>
    render(
      <MemoryRouter>
        <AuthProvider>
          <ClaimUsernameModal />
        </AuthProvider>
      </MemoryRouter>
    );

  it('1. Modal muncul ketika user.needs_username_update === true', async () => {
    const mockUser: User = {
      id: 'user-legacy-1',
      username: 'John Doe',
      role: 'user',
      created_at: new Date().toISOString(),
      needs_username_update: true,
    };
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Pembaruan Format Username')).toBeDefined();
    });

    expect(screen.getByText(/Username Anda saat ini adalah:/i)).toBeDefined();
    expect(screen.getByText('John Doe')).toBeDefined();
    expect(screen.getByRole('textbox', { name: /Username Baru/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Simpan Username Baru/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Keluar \(Logout\)/i })).toBeDefined();
  });

  it('2. Modal tidak muncul ketika user.needs_username_update === false atau undefined', async () => {
    const mockStandardUser: User = {
      id: 'user-standard-1',
      username: 'johndoe',
      role: 'user',
      created_at: new Date().toISOString(),
      needs_username_update: false,
    };
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockStandardUser });

    renderModal();

    await waitFor(() => {
      expect(authApi.getMeApi).toHaveBeenCalled();
    });

    expect(screen.queryByText('Pembaruan Format Username')).toBeNull();
  });

  it('3. Kandidat username bersih disarankan otomatis dari username lama (misal: "John Doe" -> "john_doe")', async () => {
    const mockUser: User = {
      id: 'user-legacy-2',
      username: 'John Doe',
      role: 'user',
      created_at: new Date().toISOString(),
      needs_username_update: true,
    };
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Pembaruan Format Username')).toBeDefined();
    });

    const input = screen.getByRole('textbox', { name: /Username Baru/i }) as HTMLInputElement;
    expect(input.value).toBe('john_doe');
  });

  it('4. Validasi error muncul jika user memasukkan spasi, karakter tidak valid, atau kurang dari 3 karakter', async () => {
    const mockUser: User = {
      id: 'user-legacy-3',
      username: 'Old Name',
      role: 'user',
      created_at: new Date().toISOString(),
      needs_username_update: true,
    };
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Pembaruan Format Username')).toBeDefined();
    });

    const input = screen.getByRole('textbox', { name: /Username Baru/i });

    // a. Kurang dari 3 karakter
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.getByText(/Username minimal 3 karakter/i)).toBeDefined();

    // b. Memasukkan spasi
    fireEvent.change(input, { target: { value: 'john doe' } });
    expect(screen.getByText(/Username tidak boleh mengandung spasi/i)).toBeDefined();

    // c. Memasukkan karakter tidak valid (simbol khusus)
    fireEvent.change(input, { target: { value: 'john@doe' } });
    expect(screen.getByText(/Username hanya boleh berisi huruf kecil/i)).toBeDefined();

    // d. Memasukkan huruf kapital
    fireEvent.change(input, { target: { value: 'John_Doe' } });
    expect(screen.getByText(/Username hanya boleh berisi huruf kecil/i)).toBeDefined();

    // e. Kembali ke format yang valid
    fireEvent.change(input, { target: { value: 'john_doe_clean' } });
    expect(screen.queryByText(/Username minimal 3 karakter/i)).toBeNull();
    expect(screen.queryByText(/Username tidak boleh mengandung spasi/i)).toBeNull();
    expect(screen.queryByText(/Username hanya boleh berisi huruf kecil/i)).toBeNull();
  });

  it('5. Memanggil updateUsername berhasil saat form disubmit dengan username valid', async () => {
    const mockUser: User = {
      id: 'user-legacy-4',
      username: 'Old Name',
      role: 'user',
      created_at: new Date().toISOString(),
      needs_username_update: true,
    };
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });

    const updateSpy = vi.spyOn(authApi, 'updateUsernameApi').mockResolvedValue({
      user: {
        ...mockUser,
        username: 'old_name',
        needs_username_update: false,
      },
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Pembaruan Format Username')).toBeDefined();
    });

    const submitBtn = screen.getByRole('button', { name: /Simpan Username Baru/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('old_name');
    });

    // Modal otomatis tertutup karena needs_username_update menjadi false
    await waitFor(() => {
      expect(screen.queryByText('Pembaruan Format Username')).toBeNull();
    });
  });

  it('6. Error dari API (misal username sudah digunakan) ditampilkan ke pengguna', async () => {
    const mockUser: User = {
      id: 'user-legacy-5',
      username: 'Duplicate Name',
      role: 'user',
      created_at: new Date().toISOString(),
      needs_username_update: true,
    };
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });

    vi.spyOn(authApi, 'updateUsernameApi').mockRejectedValue({
      message: 'Username sudah digunakan oleh akun lain',
    });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Pembaruan Format Username')).toBeDefined();
    });

    const submitBtn = screen.getByRole('button', { name: /Simpan Username Baru/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Username sudah digunakan oleh akun lain')).toBeDefined();
    });

    // Modal tetap terbuka
    expect(screen.getByText('Pembaruan Format Username')).toBeDefined();
  });

  it('7. Tombol "Keluar (Logout)" berfungsi dengan baik', async () => {
    const mockUser: User = {
      id: 'user-legacy-6',
      username: 'Want To Logout',
      role: 'user',
      created_at: new Date().toISOString(),
      needs_username_update: true,
    };
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });
    const logoutSpy = vi.spyOn(authApi, 'logoutApi').mockResolvedValue();

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Pembaruan Format Username')).toBeDefined();
    });

    const logoutBtn = screen.getByRole('button', { name: /Keluar \(Logout\)/i });
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalled();
    });

    // Setelah logout, user menjadi null sehingga modal tertutup
    await waitFor(() => {
      expect(screen.queryByText('Pembaruan Format Username')).toBeNull();
    });
  });
});
