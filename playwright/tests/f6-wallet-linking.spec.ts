import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName, generateUniqueItemName } from '../helpers/test-data';

test.describe('F6: Linking Pemilik (Owner Linking Lifecycle)', () => {
  test.describe.configure({ mode: 'serial' });

  test('@e2e @ui complete lifecycle: link request, rejection, re-request, approval, history visibility, and creator unlink', async ({
    authenticatedCreatorPage: creatorPage,
    authenticatedOwnerPage: ownerPage,
    creatorUser,
    ownerUser,
    apiClient,
  }) => {
    // 1. Creator creates a wallet and seeds initial transaction before linking
    const walletName = generateUniqueWalletName('Link Lifecycle');
    const wallet = await (await apiClient.createWallet(walletName)).json();
    const walletId = wallet.id || wallet.wallet?.id;

    const preLinkItem = generateUniqueItemName('Item Sebelum Tertaut');
    await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 55000,
      item_name: preLinkItem,
    });

    // 2. Creator requests link to ownerUser
    await creatorPage.goto(`/wallets/${walletId}`);
    await creatorPage.waitForLoadState('networkidle');

    // Click Link / Bagikan / Tautkan
    const linkBtn = creatorPage.getByRole('button', { name: /Tautkan/i }).first();
    await linkBtn.click();

    const linkModal = creatorPage.getByRole('dialog');
    await expect(linkModal).toBeVisible();

    await creatorPage.getByLabel(/Username Teman/i).fill(ownerUser.username);
    await creatorPage.getByRole('button', { name: /Kirim Permintaan Tautan/i }).click();
    await creatorPage.getByRole('button', { name: /Tutup/i }).click();
    await expect(linkModal).not.toBeVisible();

    // 3. Owner views incoming link request on /links page
    await ownerPage.goto('/links');
    await ownerPage.waitForLoadState('networkidle');

    await expect(ownerPage.getByText(walletName).first()).toBeVisible();
    await expect(ownerPage.getByText(creatorUser.username).first()).toBeVisible();

    // 4. Test Rejection flow (no cooldown, can be re-linked)
    const rejectBtn = ownerPage.getByRole('button', { name: /Tolak|Reject/i }).first();
    await rejectBtn.click();
    await expect(ownerPage.getByText(/Ditolak/i).first()).toBeVisible();

    // 5. Creator immediately sends re-link request (no cooldown)
    await creatorPage.goto(`/wallets/${walletId}`);
    await creatorPage.waitForLoadState('networkidle');
    await linkBtn.click();
    await creatorPage.getByLabel(/Username Teman/i).fill(ownerUser.username);
    await creatorPage.getByRole('button', { name: /Kirim Permintaan Tautan/i }).click();
    await creatorPage.getByRole('button', { name: /Tutup/i }).click();

    // 6. Owner approves the new request
    await ownerPage.goto('/links');
    await ownerPage.waitForLoadState('networkidle');
    const approveBtn = ownerPage.getByRole('button', { name: /Setujui|Approve|Terima/i }).first();
    await approveBtn.click();
    await expect(ownerPage.getByText(/Disetujui|Approved/i).first()).toBeVisible();

    // 7. Owner now sees wallet on "Dompet milik saya" tab and full history including pre-link entries
    await ownerPage.goto('/');
    await ownerPage.waitForLoadState('networkidle');

    const ownerTab = ownerPage.getByRole('tab', { name: /Dompet Milik Saya|Milik Saya/i });
    if (await ownerTab.isVisible()) {
      await ownerTab.click();
    }
    await expect(ownerPage.getByText(walletName).first()).toBeVisible();

    // Open wallet detail as owner
    await ownerPage.getByText(walletName).first().click();
    await ownerPage.waitForLoadState('networkidle');

    // Pre-link entry must be visible to owner
    await expect(ownerPage.getByText(preLinkItem).first()).toBeVisible();
    await expect(ownerPage.getByText(/55\.000/).first()).toBeVisible();

    // Owner cannot add entries or unlink (read-only view for ledger modifications)
    const ownerAddEntry = ownerPage.getByRole('button', { name: /Catat Transaksi/i });
    await expect(ownerAddEntry).not.toBeVisible();

    // 8. Creator unlinks wallet
    await creatorPage.goto(`/wallets/${walletId}`);
    await creatorPage.waitForLoadState('networkidle');

    const unlinkBtn = creatorPage.getByRole('button', { name: /Putus Tautan/i }).first();
    if (await unlinkBtn.isVisible()) {
      await unlinkBtn.click();
    } else {
      const menu = creatorPage.locator('button:has(svg[data-testid="MoreVertIcon"])').first();
      await menu.click();
      await creatorPage.getByRole('menuitem', { name: /Putus Tautan Rekan/i }).click();
    }

    const confirmUnlink = creatorPage.getByRole('button', { name: /Ya, Putus Tautan/i });
    await expect(confirmUnlink).toBeVisible();
    await confirmUnlink.click();

    // Wallet balance and history remain intact for creator
    await expect(creatorPage.getByText(preLinkItem).first()).toBeVisible();
  });
});

