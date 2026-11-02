import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';
import {
  setCachedUser,
  getCachedUser,
  clearCachedUser,
  getCurrentUserId,
  setCurrentUserId,
  resetDBInstance,
  clearAllOfflineEntries,
} from '../offline/db';
import { setSimulatedOffline } from '../offline/networkMode';
import { User } from '../types';

const mockUser: User = {
  id: 'usr-offline-persist-1',
  username: 'khafabi_offline',
  role: 'user',
  created_at: '2026-02-22T10:00:00Z',
};

const ProtectedTestPage: React.FC = () => {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return <div data-testid="loading-indicator">Loading Session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div>
      <h1 data-testid="user-greeting">Welcome, {user.username}!</h1>
      <span data-testid="user-id">{user.id}</span>
      <span data-testid="user-role">{user.role}</span>
      <button data-testid="logout-btn" onClick={() => logout()}>
        Keluar
      </button>
    </div>
  );
};

const LoginPageMock: React.FC = () => {
  const { login, isLoading } = useAuth();
  if (isLoading) {
    return <div data-testid="login-loading">Loading login page...</div>;
  }
  return (
    <div>
      <h1 data-testid="login-header">Halaman Login</h1>
      <button
        data-testid="login-action-btn"
        onClick={() => login('khafabi_offline', 'password123')}
      >
        Masuk
      </button>
    </div>
  );
};

const renderAppWithRoute = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<ProtectedTestPage />} />
          <Route path="/login" element={<LoginPageMock />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );

describe('Offline Auth Persistence & Session Resiliency', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    resetDBInstance();
    await clearCachedUser();
    await clearAllOfflineEntries();
    setCurrentUserId(null);
    setSimulatedOffline(false);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(async () => {
    setSimulatedOffline(false);
    await clearCachedUser();
  });

  it('saves user to cache and synchronizes setCurrentUserId when online getMeApi succeeds', async () => {
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });

    renderAppWithRoute('/');

    await waitFor(() => {
      expect(screen.getByTestId('user-greeting')).toBeDefined();
      expect(screen.getByTestId('user-greeting').textContent).toContain('khafabi_offline');
    });

    // Check that cache was populated
    const cached = await getCachedUser();
    expect(cached).not.toBeNull();
    expect(cached?.id).toBe(mockUser.id);
    expect(cached?.username).toBe(mockUser.username);
    expect(getCurrentUserId()).toBe(mockUser.id);
  });

  it('restores authenticated user session from cache when page is refreshed while offline', async () => {
    // 1. User was previously authenticated and saved to local cache
    await setCachedUser(mockUser);
    expect(await getCachedUser()).not.toBeNull();

    // 2. Network goes offline / simulated offline
    setSimulatedOffline(true);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 3. User refreshes page (mounting AuthProvider in offline mode)
    renderAppWithRoute('/');

    // 4. Protected page renders successfully instead of redirecting to /login
    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).toBeNull();
      expect(screen.getByTestId('user-greeting')).toBeDefined();
      expect(screen.getByTestId('user-greeting').textContent).toContain('khafabi_offline');
      expect(screen.getByTestId('user-id').textContent).toBe('usr-offline-persist-1');
    });

    // Active user id is synced to enable wallet and entry access
    expect(getCurrentUserId()).toBe('usr-offline-persist-1');

    // Warning is logged to alert developer/user of offline session mode
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthContext] Running in offline session mode'),
      'khafabi_offline'
    );
  });

  it('falls back to cached session when getMeApi fails due to network error (status 0)', async () => {
    await setCachedUser(mockUser);

    // Online according to navigator, but backend is unreachable / network drops
    vi.spyOn(authApi, 'getMeApi').mockRejectedValue(
      new ApiError('Network connection error', 0)
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderAppWithRoute('/');

    await waitFor(() => {
      expect(screen.getByTestId('user-greeting')).toBeDefined();
      expect(screen.getByTestId('user-greeting').textContent).toContain('khafabi_offline');
    });

    expect(getCurrentUserId()).toBe('usr-offline-persist-1');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to cached session when backend returns 500 / 503 server error', async () => {
    await setCachedUser(mockUser);

    vi.spyOn(authApi, 'getMeApi').mockRejectedValue(
      new ApiError('Internal Server Error', 500)
    );

    renderAppWithRoute('/');

    await waitFor(() => {
      expect(screen.getByTestId('user-greeting')).toBeDefined();
      expect(screen.getByTestId('user-greeting').textContent).toContain('khafabi_offline');
    });

    expect(getCurrentUserId()).toBe('usr-offline-persist-1');
  });

  it('clears cache and logs user out when getMeApi returns HTTP 401 Unauthorized', async () => {
    await setCachedUser(mockUser);

    // Backend explicitly rejects with 401 (e.g. token expired, session revoked)
    vi.spyOn(authApi, 'getMeApi').mockRejectedValue(
      new ApiError('Unauthorized session', 401)
    );

    renderAppWithRoute('/');

    // User should be redirected to /login
    await waitFor(() => {
      expect(screen.getByTestId('login-header')).toBeDefined();
    });

    // Cache should be cleared
    expect(await getCachedUser()).toBeNull();
    expect(getCurrentUserId()).toBeNull();
  });

  it('redirects to /login if offline with no cached session', async () => {
    setSimulatedOffline(true);
    await clearCachedUser();

    renderAppWithRoute('/');

    await waitFor(() => {
      expect(screen.getByTestId('login-header')).toBeDefined();
    });

    expect(getCurrentUserId()).toBeNull();
  });

  it('caches user on successful login', async () => {
    vi.spyOn(authApi, 'getMeApi').mockRejectedValue(new ApiError('No session', 401));
    vi.spyOn(authApi, 'loginApi').mockResolvedValue({ user: mockUser });

    renderAppWithRoute('/login');

    await waitFor(() => {
      expect(screen.queryByTestId('login-loading')).toBeNull();
      expect(screen.getByTestId('login-header')).toBeDefined();
    });

    await act(async () => {
      screen.getByTestId('login-action-btn').click();
    });

    await waitFor(async () => {
      const cached = await getCachedUser();
      expect(cached).not.toBeNull();
      expect(cached?.username).toBe('khafabi_offline');
      expect(getCurrentUserId()).toBe(mockUser.id);
    });
  });

  it('clears cached user and resets state on logout', async () => {
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });
    vi.spyOn(authApi, 'logoutApi').mockResolvedValue(undefined);

    renderAppWithRoute('/');

    await waitFor(() => {
      expect(screen.getByTestId('user-greeting')).toBeDefined();
    });

    expect(await getCachedUser()).not.toBeNull();

    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-header')).toBeDefined();
    });

    expect(await getCachedUser()).toBeNull();
    expect(getCurrentUserId()).toBeNull();
  });

  it('cleans up local session and cache even if server logoutApi fails when offline', async () => {
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });
    vi.spyOn(authApi, 'logoutApi').mockRejectedValue(new ApiError('You are currently offline', 0));

    renderAppWithRoute('/');

    await waitFor(() => {
      expect(screen.getByTestId('user-greeting')).toBeDefined();
    });

    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-header')).toBeDefined();
    });

    expect(await getCachedUser()).toBeNull();
    expect(getCurrentUserId()).toBeNull();
  });

  it('does not log out or clear cache if user cancels logout confirmation', async () => {
    vi.spyOn(authApi, 'getMeApi').mockResolvedValue({ user: mockUser });
    const logoutSpy = vi.spyOn(authApi, 'logoutApi');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    // Mock pending offline count so confirmation dialog is triggered
    const dbModule = await import('../offline/db');
    vi.spyOn(dbModule, 'getPendingOfflineCount').mockResolvedValue(2);

    renderAppWithRoute('/');

    await waitFor(() => {
      expect(screen.getByTestId('user-greeting')).toBeDefined();
    });

    await act(async () => {
      screen.getByTestId('logout-btn').click();
    });

    // Logout was cancelled, user remains authenticated
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('user-greeting')).toBeDefined();
    expect(await getCachedUser()).not.toBeNull();
  });
});
