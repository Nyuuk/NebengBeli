import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName, generateUniqueItemName } from '../helpers/test-data';

test.describe('F2: Pencatatan Tunggal per Dompet', () => {
  test('@e2e @ui creator records single titipan and single top-up with optional note from wallet detail page', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    // 1. Create wallet
    const walletName = generateUniqueWalletName('Buku Single');
    const wRes = await apiClient.createWallet(walletName);
    const wallet = await wRes.json();
    const walletId = wallet.id || wallet.wallet?.id;

    // 2. Navigate to wallet detail page
    await page.goto(`/wallets/${walletId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: walletName })).toBeVisible();

    // 3. Add Single Titipan Entry
    const addEntryBtn = page.getByRole('button', { name: /Tambah Transaksi|\+ Transaksi|Catat/i }).first();
    await addEntryBtn.click();

    // Entry modal should appear
    const modalTitle = page.getByRole('heading', { name: /Catat Transaksi|Tambah Entri/i });
    await expect(modalTitle).toBeVisible();

    // Fill Titipan
    const itemName = generateUniqueItemName('Soto Ayam');
    await page.getByLabel(/Nama Barang|Nama Item/i).fill(itemName);
    await page.getByLabel(/Nominal|Harga/i).fill('35000');
    await page.getByLabel(/Catatan|Keterangan/i).fill('Kuah dipisah');

    await page.getByRole('button', { name: /Simpan Transaksi|Simpan Entri|Simpan/i }).click();
    await expect(modalTitle).not.toBeVisible();

    // Verify Titipan entry listed in statement
    await expect(page.getByText(itemName).first()).toBeVisible();
    await expect(page.getByText(/35\.000/).first()).toBeVisible();

    // 4. Add Single Top-up Entry
    await addEntryBtn.click();
    await expect(modalTitle).toBeVisible();

    // Switch to Top-up type via select
    await page.getByRole('combobox', { name: /Tipe Entri/i }).click();
    await page.getByRole('option', { name: /Topup|Top-up|Pembayaran/i }).click();

    // Fill Top-up nominal, purpose, and optional note
    await page.getByLabel(/Nominal/i).fill('50000');
    await page.getByLabel(/Nama Barang|Keperluan/i).fill('Pelunasan Kas');
    const topupNote = 'Transfer BCA 1 Okt';
    await page.getByLabel(/Catatan/i).fill(topupNote);

    await page.getByRole('button', { name: /Simpan Transaksi|Simpan Entri|Simpan/i }).click();
    await expect(modalTitle).not.toBeVisible();

    // Verify Top-up entry listed with note and correct balance calculation
    await expect(page.getByText(topupNote).first()).toBeVisible();
    await expect(page.getByText(/50\.000/).first()).toBeVisible();
  });

  test('@api backend accepts single titipan and top-up with signed amounts and optional notes', async ({
    apiClient,
  }) => {
    const wRes = await apiClient.createWallet(generateUniqueWalletName('API Single'));
    const wData = await wRes.json();
    const walletId = wData.id || wData.wallet?.id;

    // Create titipan (30.000)
    const titipanRes = await apiClient.createEntry(walletId, {
      type: 'titipan',
      amount: 30000,
      item_name: 'Nasi Rames',
      note: 'Porsi besar',
    });
    expect(titipanRes.status()).toBe(201);
    const titipan = (await titipanRes.json()).entry;
    expect(titipan.amount).toBe(30000);
    expect(titipan.type).toBe('titipan');

    // Create topup (20.000)
    const topupRes = await apiClient.createEntry(walletId, {
      type: 'topup',
      amount: 20000,
      item_name: 'Top-up Mandiri',
      note: 'Transfer via Livin',
    });
    expect(topupRes.status()).toBe(201);
    const topup = (await topupRes.json()).entry;
    expect(topup.amount).toBe(-20000);
    expect(topup.type).toBe('topup');
  });
});
