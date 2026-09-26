import { request } from './client';
import { EntryType, StatementResponse } from '../types';

export interface StatementFilterParams {
  page?: number;
  limit?: number;
  type?: EntryType;
  start_date?: string;
  end_date?: string;
}

export async function getStatementApi(
  walletId: string,
  params: StatementFilterParams = {}
): Promise<StatementResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.type) searchParams.set('type', params.type);
  if (params.start_date) searchParams.set('start_date', params.start_date);
  if (params.end_date) searchParams.set('end_date', params.end_date);

  const qs = searchParams.toString();
  const path = `/api/wallets/${walletId}/statement${qs ? `?${qs}` : ''}`;
  return request<StatementResponse>(path);
}

export function getExportCSVUrl(walletId: string, params: StatementFilterParams = {}): string {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set('type', params.type);
  if (params.start_date) searchParams.set('start_date', params.start_date);
  if (params.end_date) searchParams.set('end_date', params.end_date);

  const qs = searchParams.toString();
  return `/api/wallets/${walletId}/statement/export${qs ? `?${qs}` : ''}`;
}
