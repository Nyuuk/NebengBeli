import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName } from '../helpers/test-data';

test.describe('F8: Insight Pembuat & Statistik Saldo di Luar', () => {
  test('@e2e @ui creator dashboard displays total money outside and balance statistics', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    // 1. Create two wallets with debts (titipan is stored negative; "money owed to
    // creator" is reported back to the UI as a positive outstanding total)
    const res1 = await (await apiClient.createWallet(generateUniqueWalletName('Insight A'))).json();
    const w1Id = res1.id || res1.wallet?.id;
    const res2 = await (await apiClient.createWallet(generateUniqueWalletName('Insight B'))).json();
    const w2Id = res2.id || res2.wallet?.id;

    await apiClient.createEntry(w1Id, {
      type: 'titipan',
      amount: 75000,
      item_name: 'Belanja Supermarket',
    });

    await apiClient.createEntry(w2Id, {
      type: 'titipan',
      amount: 45000,
      item_name: 'Buku Catatan',
    });

    // Total money outside = 120.000

    // 2. Open Creator Dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify "Total Uang Saya yang Masih di Luar" banner / card is visible
    const outsideLabel = page.getByText(/Total Uang Saya yang Masih di Luar|Uang di Luar|Total Tagihan di Luar/i).first();
    await expect(outsideLabel).toBeVisible();

    // Verify formatted sum 120.000 is displayed
    await expect(page.getByText(/120\.000/).first()).toBeVisible();
  });

  test('@api backend insights endpoint returns correct aggregations for active creator wallets', async ({
    apiClient,
  }) => {
    const res = await (await apiClient.createWallet(generateUniqueWalletName('API Insight'))).json();
    const wId = res.id || res.wallet?.id;
    await apiClient.createEntry(wId, {
      type: 'titipan',
      amount: 60000,
      item_name: 'Makan Malam',
    });

    const insightsRes = await apiClient.getInsights();
    expect(insightsRes.ok()).toBeTruthy();
    const data = await insightsRes.json();
    const total = data.total_outstanding ?? data.total_money_outside;
    expect(total).toBeGreaterThanOrEqual(60000);
  });
});
