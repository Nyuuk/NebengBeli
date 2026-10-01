import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName } from '../helpers/test-data';

test.describe('F5: Manajemen Dompet (Pembuat)', () => {
  test.describe.configure({ mode: 'serial' });

  test('@e2e @ui creator creates wallet, renames it, archives with non-zero warning, and unarchives', async ({
    authenticatedCreatorPage: page,
    ownerUser,
    apiClient,
  }) => {
    const initialName = generateUniqueWalletName('Dompet Awal');
    const updatedName = generateUniqueWalletName('Dompet Updated');

    // 1. Create wallet via UI with name and optional target username
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click "Buat Buku"
    const createBtn = page.getByRole('button', { name: /Buat Buku/i }).first();
    await createBtn.click();

    await page.getByLabel(/Nama Buku/i).fill(initialName);
    await page.getByLabel(/Tautkan ke Username Rekan/i).fill(ownerUser.username);

    await page.getByRole('button', { name: 'Buat Buku' }).click();

    // Verify wallet card appears on dashboard
    await expect(page.getByText(initialName).first()).toBeVisible({ timeout: 8000 });

    // 2. Open Wallet Detail Page
    await page.getByText(initialName).first().click();
    await page.waitForLoadState('networkidle');

    // Seed non-zero transaction via API to trigger warning during archive
    const wData = await (await apiClient.listWallets()).json();
    const wList = wData.wallets || wData;
    const createdWallet = wList.find((w: any) => w.name === initialName);
    expect(createdWallet).toBeDefined();

    await apiClient.createEntry(createdWallet.id, {
      type: 'titipan',
      amount: 12000,
      item_name: 'Es Jeruk',
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 3. Rename wallet
    const menuBtn = page.locator('button:has(svg[data-testid="MoreVertIcon"])').first();
    await menuBtn.click();
    await page.getByRole('menuitem', { name: /Ganti Nama Buku/i }).click();

    const renameInput = page.getByLabel(/Nama Baru/i);
    await renameInput.fill(updatedName);
    await page.getByRole('button', { name: 'Simpan' }).click();

    await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

    // 4. Archive wallet with non-zero warning (accept window.confirm dialog)
    let dialogAppeared = false;
    page.once('dialog', async (dialog) => {
      dialogAppeared = true;
      expect(dialog.message()).toContain('Peringatan: Buku ini masih memiliki saldo');
      await dialog.accept();
    });

    await menuBtn.click();
    await page.getByRole('menuitem', { name: /Arsipkan Buku/i }).click();
    await page.waitForTimeout(500);
    expect(dialogAppeared).toBeTruthy();

    // 5. Verify archived wallet is moved to "Arsip" tab and is read-only
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const arsipTab = page.getByRole('tab', { name: /Diarsipkan|Arsip/i });
    await arsipTab.click();
    await expect(page.getByText(updatedName).first()).toBeVisible();

    // Open archived wallet
    await page.getByText(updatedName).first().click();
    await page.waitForLoadState('networkidle');

    // Archived badge shown
    await expect(page.getByText(/Diarsipkan/i).first()).toBeVisible();

    // 6. Unarchive wallet
    await menuBtn.click();
    await page.getByRole('menuitem', { name: /Batalkan Arsip/i }).click();
    await page.waitForTimeout(500);

    // Should return to active list
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(updatedName).first()).toBeVisible();
  });

  test('@api backend prevents creating entries in an archived wallet', async ({
    apiClient,
  }) => {
    const walletName = generateUniqueWalletName('API Archive');
    const wallet = await (await apiClient.createWallet(walletName)).json();
    const walletId = wallet.id || wallet.wallet?.id;

    // Archive wallet
    const archRes = await apiClient.archiveWallet(walletId);
    expect(archRes.ok()).toBeTruthy();

    // Attempt to create entry
    const entryRes = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 10000,
      item_name: 'Kerupuk',
    });
    expect(entryRes.status()).toBe(400);
  });
});
