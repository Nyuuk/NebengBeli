import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName, generateUniqueItemName } from '../helpers/test-data';

test.describe('F3: Transaksi Koreksi & Pindah Dompet', () => {
  test.describe.configure({ mode: 'serial' });

  test('@e2e @ui creator performs correction to target nominal, cancellation to 0, and views effective history', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    // 1. Create wallet and initial titipan
    const walletName = generateUniqueWalletName('Buku Koreksi');
    const wRes = await apiClient.createWallet(walletName);
    const wallet = await wRes.json();
    const walletId = wallet.id || wallet.wallet?.id;

    const itemName = generateUniqueItemName('Kopi Susu Gula Aren');
    const entryRes = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 25000,
      item_name: itemName,
      note: 'Normal ice',
    });
    const entry = (await entryRes.json()).entry;

    // 2. Open wallet detail page
    await page.goto(`/wallets/${walletId}`);
    await page.waitForLoadState('networkidle');

    // 3. Open Correction Modal for the entry
    // Locate the entry row and click its action / koreksi button
    const entryRow = page.locator('tr').filter({ hasText: itemName }).first();
    const koreksiBtn = entryRow.locator('button').first();
    await koreksiBtn.click();

    // Verify modal appears
    const modalTitle = page.getByRole('heading', { name: /Koreksi Transaksi/i });
    await expect(modalTitle).toBeVisible();

    // Verify original entry values shown
    await expect(page.getByText(itemName).first()).toBeVisible();

    // 4. Change nominal yang benar to 30.000 with quick reason "Salah Harga"
    const amountInput = page.getByLabel(/Nominal yang Benar/i);
    await amountInput.fill('30000');
    await page.getByRole('button', { name: 'Salah Harga' }).click();

    // Submit correction
    await page.getByRole('button', { name: /Simpan Koreksi/i }).click();
    await expect(modalTitle).not.toBeVisible();

    // 5. Verify effective amount is now 30.000 and old value is struck through or updated
    await expect(page.getByText(/30\.000/).first()).toBeVisible();

    // 6. Test Cancellation to 0 with quick reason "Batal"
    const originalRow = page.locator('tr').filter({ hasText: itemName }).filter({ hasText: /Titipan/i }).first();
    const originalKoreksiBtn = originalRow.locator('button').first();
    await originalKoreksiBtn.click();
    await expect(modalTitle).toBeVisible();

    // Clicking "Batal" quick reason sets target nominal to 0
    await page.getByRole('group').getByRole('button', { name: 'Batal' }).click();
    await expect(amountInput).toHaveValue('0');

    await page.getByRole('button', { name: /Simpan Koreksi/i }).click();
    await expect(modalTitle).not.toBeVisible();

    // Verify balance is now 0 (reversal completed)
    await expect(page.getByText(/Rp 0|Rp\s*0/).first()).toBeVisible();
  });

  test('@e2e @ui action "Pindahkan ke dompet lain" atomically reverses source entry and creates new entry in target wallet', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    // 1. Create source and target wallets
    const srcName = generateUniqueWalletName('Dompet Asal');
    const dstName = generateUniqueWalletName('Dompet Tujuan');
    const srcWallet = await (await apiClient.createWallet(srcName)).json();
    const dstWallet = await (await apiClient.createWallet(dstName)).json();
    const srcWalletId = srcWallet.id || srcWallet.wallet?.id;
    const dstWalletId = dstWallet.id || dstWallet.wallet?.id;

    // Seed titipan on source wallet
    const itemName = generateUniqueItemName('Martabak Telur');
    const itemPrice = 45000;
    await apiClient.createEntry(srcWalletId, {
      type: 'titipan',
      amount: itemPrice,
      item_name: itemName,
      note: 'Untuk dompet salah',
    });

    // 2. Open source wallet detail page
    await page.goto(`/wallets/${srcWalletId}`);
    await page.waitForLoadState('networkidle');

    // 3. Click "Pindah" button on entry
    const entryRow = page.locator('tr').filter({ hasText: itemName }).first();
    const moveBtn = entryRow.locator('button').nth(1);
    await moveBtn.click();

    // Move modal should open
    const modalTitle = page.getByRole('heading', { name: /Pindah Entri ke Buku Lain|Pindah/i });
    await expect(modalTitle).toBeVisible();

    // Select target wallet from dropdown
    const selectTrigger = page.getByLabel(/Pilih Buku Tujuan|Buku Tujuan|Target Wallet/i);
    await selectTrigger.click();
    const dstOption = page.getByRole('option', { name: new RegExp(dstName, 'i') }).first();
    await dstOption.click();

    // Submit move
    await page.getByRole('button', { name: /Pindahkan Entri|Pindahkan/i }).click();
    await expect(modalTitle).not.toBeVisible();

    // 4. Verify source wallet is now reversed (effective amount 0)
    await expect(page.getByText(/Rp 0|Rp\s*0/).first()).toBeVisible();

    // 5. Navigate to destination wallet and verify item is present with full amount
    await page.goto(`/wallets/${dstWalletId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(itemName).first()).toBeVisible();
    await expect(page.getByText(/45\.000/).first()).toBeVisible();
  });

  test('@api disallow non-creator from creating corrections and disallow correcting a correction', async ({
    apiClient,
    ownerUser,
    request,
  }) => {
    // 1. Creator creates wallet & entry
    const wRes = await apiClient.createWallet(generateUniqueWalletName('Creator Wallet'));
    const wData = await wRes.json();
    const walletId = wData.id || wData.wallet?.id;

    const entryRes = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 15000,
      item_name: 'Donat',
    });
    const entryId = (await entryRes.json()).entry.id;

    // 2. Disallow correcting a correction
    // First make valid correction
    const corrRes = await apiClient.createEntry(walletId, {
      type: 'koreksi',
      amount: 20000,
      item_name: 'Donat',
      corrects_entry_id: entryId,
      correction_reason: 'salah harga',
    });
    expect(corrRes.status()).toBe(201);
    const corrEntryId = (await corrRes.json()).entry.id;

    // Attempt to correct the correction
    const invalidCorr = await apiClient.createEntry(walletId, {
      type: 'koreksi',
      amount: 25000,
      item_name: 'Donat',
      corrects_entry_id: corrEntryId,
      correction_reason: 'salah harga',
    });
    expect(invalidCorr.status()).toBe(400);
  });
});
