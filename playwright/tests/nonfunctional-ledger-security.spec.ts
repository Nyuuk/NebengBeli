import { test, expect, API_URL } from '../fixtures/test-fixtures';
import { generateUniqueWalletName } from '../helpers/test-data';

test.describe('Non-Functional & Core Ledger Rules', () => {
  test('@api health and readiness probes respond successfully', async ({
    request,
    playwright,
  }) => {
    // 1. Frontend static health probe
    const feHealthz = await request.get('/healthz');
    expect(feHealthz.ok()).toBeTruthy();

    // 2. Direct backend readiness and health probes
    const backendReq = await playwright.request.newContext({ baseURL: API_URL });
    const readyz = await backendReq.get('/readyz');
    expect(readyz.ok()).toBeTruthy();
    const readyBody = await readyz.json();
    expect(readyBody.status).toBe('ready');

    const beHealthz = await backendReq.get('/healthz');
    expect(beHealthz.ok()).toBeTruthy();
    await backendReq.dispose();
  });

  test('@api no debt limit: wallet allows negative balances without blocking transactions', async ({
    apiClient,
  }) => {
    const resW = await (await apiClient.createWallet(generateUniqueWalletName('NoDebtLimit'))).json();
    const walletId = resW.id || resW.wallet?.id;

    // Create huge titipan (50.000.000)
    const res1 = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 50000000,
      item_name: 'Laptop Pengganti',
    });
    expect(res1.status()).toBe(201);

    // Create another titipan on top of large debt without blocking
    const res2 = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 100000000,
      item_name: 'Sewa Ruangan',
    });
    expect(res2.status()).toBe(201);

    const stmt = (await (await apiClient.getStatement(walletId)).json()).summary;
    expect(stmt.current_balance).toBe(150000000);
  });

  test('@api authorization matrix: unauthorized caller is blocked with 401 across all protected routes', async ({
    playwright,
  }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const unauthReq = await playwright.request.newContext({ baseURL: API_URL });

    // Clear cookies/headers for this unauthenticated request context
    const unauthClient = await unauthReq.fetch('/api/wallets');
    expect(unauthClient.status()).toBe(401);

    const unauthEntries = await unauthReq.fetch(`/api/wallets/${fakeId}/entries`, {
      method: 'POST',
      data: { type: 'titipan', amount: 10000, item_name: 'Test' },
    });
    expect(unauthEntries.status()).toBe(401);

    const unauthAdmin = await unauthReq.fetch('/api/admin/users');
    expect(unauthAdmin.status()).toBe(401);

    await unauthReq.dispose();
  });

  test('@api signed BIGINT precision: ledger handles exact integer rupiah amounts up to millions', async ({
    apiClient,
  }) => {
    const resW = await (await apiClient.createWallet(generateUniqueWalletName('BigInt'))).json();
    const walletId = resW.id || resW.wallet?.id;

    const largeAmount = 123456789;
    const res = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: largeAmount,
      item_name: 'Heavy Asset',
    });
    expect(res.status()).toBe(201);

    const entry = (await res.json()).entry;
    expect(entry.amount).toBe(largeAmount);
  });
});
