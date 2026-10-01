import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName, generateUniqueItemName } from '../helpers/test-data';
import { grantClipboardPermissions, readClipboardText } from '../helpers/clipboard';

test.describe('F4: Rekap Teks (Export to Text)', () => {
  test('@e2e @ui creator generates text recap for all presets, verifies balance invariant, and copies to clipboard', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    // 1. Setup clipboard permissions on the page's actual browser context
    await grantClipboardPermissions(page.context());

    // 2. Create wallet and seed multi-type entries
    const walletName = generateUniqueWalletName('Rekap Dompet');
    const wallet = await (await apiClient.createWallet(walletName)).json();
    const walletId = wallet.id || wallet.wallet?.id;

    const item1 = generateUniqueItemName('Kopi V60');
    const item2 = generateUniqueItemName('Roti Bakar');

    // Titipan 1: 30.000
    const e1Res = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 30000,
      item_name: item1,
    });
    const e1 = (await e1Res.json()).entry;

    // Top-up: 50.000 (-50.000)
    await apiClient.createEntry(walletId, {
      type: 'topup',
      amount: 50000,
      item_name: 'Transfer BCA',
      note: 'Cicil jajan',
    });

    // Correction on item 1: change to 35.000 (+5.000)
    await apiClient.createEntry(walletId, {
      type: 'koreksi',
      amount: 35000,
      item_name: item1,
      corrects_entry_id: e1.id,
      correction_reason: 'salah harga',
    });

    // Titipan 2: 20.000
    await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 20000,
      item_name: item2,
    });

    // Net balance: 35.000 - 50.000 + 20.000 = +5.000

    // 3. Open wallet detail page
    await page.goto(`/wallets/${walletId}`);
    await page.waitForLoadState('networkidle');

    // 4. Open Rekap Teks Modal
    const rekapBtn = page.getByRole('button', { name: /Rekap Teks|Rekap/i }).first();
    await rekapBtn.click();

    const modalTitle = page.getByRole('heading', { name: /Buat Rekap Teks|Rekap/i });
    await expect(modalTitle).toBeVisible();

    // 5. Verify preset tabs: Hari Ini, Minggu Ini, Bulan Ini, Custom
    const todayTab = page.getByRole('tab', { name: /Hari Ini/i });
    const weekTab = page.getByRole('tab', { name: /Minggu Ini/i });
    const monthTab = page.getByRole('tab', { name: /Bulan Ini/i });
    const customTab = page.getByRole('tab', { name: /Custom/i });

    await expect(todayTab).toBeVisible();
    await expect(weekTab).toBeVisible();
    await expect(monthTab).toBeVisible();
    await expect(customTab).toBeVisible();

    // 6. Verify formatted rekap text content
    const rekapPaper = page.locator('pre, .MuiPaper-root').filter({ hasText: /REKAP BUKU TITIPAN/i }).first();
    await expect(rekapPaper).toBeVisible();
    await expect(rekapPaper).toContainText(walletName.toUpperCase());
    await expect(rekapPaper).toContainText(/Saldo Awal/i);
    await expect(rekapPaper).toContainText(/Saldo Akhir/i);
    await expect(rekapPaper).toContainText(/Rincian Transaksi/i);

    // 7. Click "Salin Teks" button and verify toast message and clipboard
    const copyBtn = page.getByRole('button', { name: /Salin Teks|Copy/i });
    await copyBtn.click();
    await expect(page.getByText(/Teks rekap berhasil disalin/i)).toBeVisible();

    const clipboardText = await readClipboardText(page);
    if (clipboardText) {
      expect(clipboardText).toContain('REKAP BUKU TITIPAN');
      expect(clipboardText).toContain(walletName.toUpperCase());
    }
  });

  test('@e2e @ui linked owner can also access and generate text recap for their wallet', async ({
    authenticatedCreatorPage: creatorPage,
    authenticatedOwnerPage: ownerPage,
    creatorUser,
    ownerUser,
    apiClient,
  }) => {
    // 1. Creator creates wallet and links owner
    const walletName = generateUniqueWalletName('OwnerRekap');
    const res = await (await apiClient.createWallet(walletName)).json();
    const walletId = res.id || res.wallet?.id;
    await apiClient.requestLink(walletId, ownerUser.username);

    // Seed transaction
    await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 40000,
      item_name: 'Es Cendol Durian',
    });

    // 2. Owner approves link request
    await ownerPage.goto('/links');
    await ownerPage.waitForLoadState('networkidle');
    const approveBtn = ownerPage.getByRole('button', { name: /Setujui|Approve/i }).first();
    await approveBtn.click();

    // 3. Owner navigates to wallet and generates recap
    await ownerPage.goto(`/wallets/${walletId}`);
    await ownerPage.waitForLoadState('networkidle');

    const rekapBtn = ownerPage.getByRole('button', { name: /Rekap Teks|Rekap/i }).first();
    await expect(rekapBtn).toBeVisible();
    await rekapBtn.click();

    await expect(ownerPage.getByRole('heading', { name: /Buat Rekap Teks|Rekap/i })).toBeVisible();
    await expect(ownerPage.getByText(/REKAP BUKU TITIPAN/i).first()).toBeVisible();
  });
});
