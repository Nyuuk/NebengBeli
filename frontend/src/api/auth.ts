import { request } from './client';
import { User } from '../types';

export interface AuthResponse {
  user: User;
  expires_at?: string;
}

export async function loginApi(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function registerApi(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logoutApi(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function getMeApi(): Promise<{ user: User }> {
  return request<{ user: User }>('/api/auth/me');
}

export async function changePasswordApi(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export async function resetPasswordApi(newPassword: string): Promise<{ message: string }> {
  return request<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function renewAuthTokenApi(): Promise<{ message?: string; user?: User; expires_at?: string }> {
  return request('/api/auth/renew', { method: 'POST' });
}
