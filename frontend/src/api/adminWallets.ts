import { adminListWalletsApi } from './admin';
import { Wallet } from '../types';

/** Load move destinations across all admin pages, bounded to 4000 wallets. */
export async function fetchAllAdminActiveWallets(): Promise<Wallet[]> {
  const wallets: Wallet[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const result = await adminListWalletsApi(200, offset);
    wallets.push(...result.wallets.filter((wallet) => !wallet.is_archived));
    offset += result.wallets.length;
    if (result.wallets.length === 0 || offset >= result.total) break;
  }
  return wallets;
}
