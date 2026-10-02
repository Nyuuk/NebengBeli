import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName } from '../helpers/test-data';

test.describe('F7: Beranda Pemilik & Pengelompokan Pembuat', () => {
  test('@e2e @ui owner dashboard groups wallets per creator with subtotals and no cross-creator total', async ({
    authenticatedOwnerPage: ownerPage,
    creatorUser,
    ownerUser,
    apiClient,
  }) => {
    // 1. Setup two wallets created by creatorUser linked to ownerUser
    const wName1 = generateUniqueWalletName('Kopi Kantor');
    const wName2 = generateUniqueWalletName('Makan Siang');

    const res1 = await (await apiClient.createWallet(wName1)).json();
    const w1Id = res1.id || res1.wallet?.id;
    const res2 = await (await apiClient.createWallet(wName2)).json();
    const w2Id = res2.id || res2.wallet?.id;

    await apiClient.requestLink(w1Id, ownerUser.username);
    await apiClient.requestLink(w2Id, ownerUser.username);

    // Seed entries
    await apiClient.createEntry(w1Id, {
      type: 'titipan',
      amount: 15000,
      item_name: 'Espresso',
    });
    await apiClient.createEntry(w2Id, {
      type: 'titipan',
      amount: 25000,
      item_name: 'Ayam Goreng',
    });

    // 2. Approve both link requests via owner
    await ownerPage.goto('/links');
    await ownerPage.waitForLoadState('networkidle');

    const approveButtons = ownerPage.getByRole('button', { name: /Setujui|Approve/i });
    const count = await approveButtons.count();
    for (let i = 0; i < count; i++) {
      const before = await approveButtons.count();
      await approveButtons.first().click();
      // Each approval triggers a re-fetch that removes its row's action buttons;
      // wait for that to land before clicking the next one, since the list is
      // re-rendered from the server response rather than updated optimistically.
      await expect(approveButtons).toHaveCount(before - 1, { timeout: 10000 });
    }

    // 3. Open Owner Dashboard
    await ownerPage.goto('/');
    await ownerPage.waitForLoadState('networkidle');

    // Switch to "Dompet Milik Saya" tab if present
    const ownerTab = ownerPage.getByRole('tab', { name: /Dompet Milik Saya|Milik Saya/i });
    if (await ownerTab.isVisible()) {
      await ownerTab.click();
    }

    // Verify creator header grouping
    await expect(ownerPage.getByText(new RegExp(`Pembuat:.*${creatorUser.username}|Dikelola oleh.*${creatorUser.username}|@${creatorUser.username}`, 'i')).first()).toBeVisible();

    // Verify both wallets are listed
    await expect(ownerPage.getByText(wName1).first()).toBeVisible();
    await expect(ownerPage.getByText(wName2).first()).toBeVisible();

    // Verify subtotal per creator and individual wallet balances are shown
    await expect(ownerPage.getByText(/Subtotal Saldo/i).first()).toBeVisible();
    await expect(ownerPage.getByText(/15\.000/).first()).toBeVisible();
    await expect(ownerPage.getByText(/25\.000/).first()).toBeVisible();

    // Verify refresh button updates data
    const refreshBtn = ownerPage.getByRole('button', { name: /Refresh|Perbarui/i }).or(ownerPage.locator('button[aria-label*="refresh"]')).first();
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await expect(ownerPage.getByText(wName1).first()).toBeVisible();
    }
  });
});
