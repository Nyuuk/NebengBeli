import { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Authenticated API Client helper for NebengBeli backend operations.
 */
export class ApiClient {
  constructor(private request: APIRequestContext) {}

  // ================= WALLET APIS =================

  async createWallet(name: string, ownerUsername?: string): Promise<APIResponse> {
    return this.request.post('/api/wallets', {
      data: {
        name,
        target_username: ownerUsername || undefined,
      },
    });
  }

  async listWallets(archived = false): Promise<APIResponse> {
    return this.request.get(`/api/wallets?archived=${archived}`);
  }

  async getWallet(id: string): Promise<APIResponse> {
    return this.request.get(`/api/wallets/${id}`);
  }

  async updateWalletName(id: string, name: string): Promise<APIResponse> {
    return this.request.patch(`/api/wallets/${id}/name`, {
      data: { name },
    });
  }

  async archiveWallet(id: string): Promise<APIResponse> {
    return this.request.post(`/api/wallets/${id}/archive`, { data: {} });
  }

  async unarchiveWallet(id: string): Promise<APIResponse> {
    return this.request.post(`/api/wallets/${id}/unarchive`, { data: {} });
  }

  async unlinkWallet(id: string): Promise<APIResponse> {
    return this.request.delete(`/api/wallets/${id}/link`);
  }

  async getItemSuggestions(walletId: string, q = '', limit = 10): Promise<APIResponse> {
    return this.request.get(`/api/wallets/${walletId}/items?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  // ================= ENTRY APIS =================

  async createEntry(walletId: string, data: {
    client_id?: string;
    type: 'titipan' | 'topup' | 'koreksi';
    amount: number;
    target_amount?: number;
    final_nominal?: number;
    item_name: string;
    note?: string;
    corrects_entry_id?: string;
    correction_reason?: string;
    occurred_at?: string;
  }): Promise<APIResponse> {
    return this.request.post(`/api/wallets/${walletId}/entries`, {
      data,
    });
  }

  async createBatchEntries(data: {
    occurred_at?: string;
    entries: Array<{
      client_id?: string;
      wallet_id: string;
      type?: 'titipan' | 'topup';
      amount: number;
      item_name: string;
      note?: string;
      occurred_at?: string;
    }>;
  }): Promise<APIResponse> {
    return this.request.post('/api/entries/batch', {
      data,
    });
  }

  async moveEntry(data: {
    client_id?: string;
    source_wallet_id: string;
    target_wallet_id: string;
    entry_id: string;
    notes?: string;
  }): Promise<APIResponse> {
    return this.request.post('/api/entries/move', {
      data,
    });
  }

  async getEntry(id: string): Promise<APIResponse> {
    return this.request.get(`/api/entries/${id}`);
  }

  async getEntryCorrections(id: string): Promise<APIResponse> {
    return this.request.get(`/api/entries/${id}/corrections`);
  }

  // ================= STATEMENT & INSIGHTS =================

  async getStatement(walletId: string, params?: {
    period?: 'today' | 'this_week' | 'this_month' | 'custom';
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<APIResponse> {
    const query = new URLSearchParams();
    if (params?.period) query.set('period', params.period);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.page_size) query.set('page_size', params.page_size.toString());

    const qs = query.toString();
    return this.request.get(`/api/wallets/${walletId}/statement${qs ? `?${qs}` : ''}`);
  }

  async getInsights(): Promise<APIResponse> {
    return this.request.get('/api/insights');
  }

  // ================= LINK REQUEST APIS =================

  async requestLink(walletId: string, targetUsername: string): Promise<APIResponse> {
    return this.request.post(`/api/wallets/${walletId}/links`, {
      data: { target_username: targetUsername },
    });
  }

  async listLinkRequests(): Promise<APIResponse> {
    return this.request.get('/api/links');
  }

  async approveLinkRequest(linkId: string): Promise<APIResponse> {
    return this.request.post(`/api/links/${linkId}/approve`, { data: {} });
  }

  async rejectLinkRequest(linkId: string): Promise<APIResponse> {
    return this.request.post(`/api/links/${linkId}/reject`, { data: {} });
  }

  // ================= ADMIN APIS =================

  async adminListUsers(limit = 50, offset = 0): Promise<APIResponse> {
    return this.request.get(`/api/admin/users?limit=${limit}&offset=${offset}`);
  }

  async adminResetPassword(username: string, newPassword: string): Promise<APIResponse> {
    return this.request.post('/api/admin/users/reset-password', {
      data: { username, new_password: newPassword },
    });
  }

  async adminListWallets(limit = 50, offset = 0): Promise<APIResponse> {
    return this.request.get(`/api/admin/wallets?limit=${limit}&offset=${offset}`);
  }

  async adminGetStats(): Promise<APIResponse> {
    return this.request.get('/api/admin/stats');
  }

  async adminListEntries(params?: { limit?: number; offset?: number; type?: string; wallet_id?: string; creator_id?: string }): Promise<APIResponse> {
    const q = new URLSearchParams();
    if (params?.limit) q.set('limit', params.limit.toString());
    if (params?.offset) q.set('offset', params.offset.toString());
    if (params?.type) q.set('type', params.type);
    if (params?.wallet_id) q.set('wallet_id', params.wallet_id);
    if (params?.creator_id) q.set('creator_id', params.creator_id);
    const qs = q.toString();
    return this.request.get(`/api/admin/entries${qs ? `?${qs}` : ''}`);
  }

  async adminGetSummary(period?: string): Promise<APIResponse> {
    const qs = period ? `?period=${period}` : '';
    return this.request.get(`/api/admin/summary${qs}`);
  }

  async adminListCreators(): Promise<APIResponse> {
    return this.request.get('/api/admin/creators');
  }

  async adminGetTrends(period?: string): Promise<APIResponse> {
    const qs = period ? `?period=${period}` : '';
    return this.request.get(`/api/admin/trends${qs}`);
  }

  async adminListAuditLogs(limit = 50, offset = 0): Promise<APIResponse> {
    return this.request.get(`/api/admin/audit-logs?limit=${limit}&offset=${offset}`);
  }
}
