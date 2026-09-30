import { isAppOnline, isSimulatedOffline } from '../offline/networkMode';

const API_BASE_URL = ''; // Relative path leverages Vite dev proxy / Nginx reverse proxy

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!isAppOnline()) {
    throw new ApiError(
      isSimulatedOffline() ? 'You are currently offline (E2E simulation mode)' : 'You are currently offline',
      0
    );
  }

  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Pass HTTP-only secure cookie
  };

  try {
    const response = await fetch(url, config);

    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get('content-type');
    let data: unknown;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage =
        (data && typeof data === 'object' && 'error' in data && typeof (data as { error: string }).error === 'string')
          ? (data as { error: string }).error
          : (data && typeof data === 'object' && 'message' in data && typeof (data as { message: string }).message === 'string')
          ? (data as { message: string }).message
          : `HTTP error ${response.status}`;
      throw new ApiError(errorMessage, response.status, data);
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network error / offline
    throw new ApiError(
      isAppOnline() ? 'Network connection error' : 'You are currently offline',
      0,
      err
    );
  }
}
