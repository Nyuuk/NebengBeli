export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  created_at: string;
}

export interface Wallet {
  id: string;
  name: string;
  creator_id: string;
  owner_id?: string;
  archived_at?: string | null;
  created_at: string;
  creator_username?: string;
  owner_username?: string;
  balance: number;
  entry_count: number;
  is_archived: boolean;
  user_role?: 'creator' | 'owner' | 'both' | 'viewer';
}

export type EntryType = 'titipan' | 'topup' | 'koreksi';

export interface Entry {
  id: string;
  client_id: string;
  wallet_id: string;
  type: EntryType;
  amount: number;
  item_name: string;
  note: string;
  corrects_entry_id?: string | null;
  correction_reason?: string;
  occurred_at: string;
  created_by: string;
  created_at: string;
  created_by_username?: string;
  running_balance?: number;
  is_offline_pending?: boolean;
}

export interface StatementSummary {
  total_titipan: number;
  total_topup: number;
  total_koreksi: number;
  current_balance: number;
  entry_count: number;
}

export interface StatementResponse {
  wallet: Wallet;
  summary: StatementSummary;
  entries: Entry[];
  total: number;
  page: number;
  page_size: number;
}

export type LinkRequestStatus = 'pending' | 'approved' | 'rejected';

export interface LinkRequest {
  id: string;
  wallet_id: string;
  requested_by: string;
  target_user_id: string;
  status: LinkRequestStatus;
  decided_at?: string | null;
  created_at: string;
  wallet_name?: string;
  requested_by_username?: string;
  target_username?: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  metadata: Record<string, unknown> | string;
  created_at: string;
  actor_username?: string;
}

export interface PendingOfflineEntry {
  client_id: string;
  wallet_id: string;
  type: EntryType;
  amount: number;
  item_name: string;
  note: string;
  corrects_entry_id?: string | null;
  correction_reason?: string;
  occurred_at: string;
  created_at: string;
  retry_count: number;
}
