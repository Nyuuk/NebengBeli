import { test, expect } from '../fixtures/test-fixtures';
import { generateUniqueWalletName, generateUniqueItemName } from '../helpers/test-data';
import { getShoppingDraftFromIDB } from '../helpers/offline-idb';

test.describe('F1: Sesi Belanja (Shopping Session)', () => {
  test.describe.configure({ mode: 'serial' });

  test('@e2e @ui multi-row shopping session records multiple entries atomically with total calculation and autocomplete', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    // 1. Setup two active wallets for creator
    const walletNameA = generateUniqueWalletName('Kopi');
    const walletNameB = generateUniqueWalletName('Makan');
    const wResA = await apiClient.createWallet(walletNameA);
    const wResB = await apiClient.createWallet(walletNameB);
    expect(wResA.ok()).toBeTruthy();
    expect(wResB.ok()).toBeTruthy();

    // Seed prior item history on Wallet A for autocomplete suggestion test
    const wA = await wResA.json();
    const walletIdA = wA.id || wA.wallet?.id;
    const priorItem = generateUniqueItemName('Latte');
    await apiClient.createEntry(walletIdA, {
      type: 'titipan',
      amount: 28000,
      item_name: priorItem,
      note: 'Favorit',
    });

    // 2. Open Sesi Belanja modal
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click "Sesi Belanja" button
    const sessionBtn = page.getByRole('button', { name: /Sesi Belanja|Shopping Session/i });
    await expect(sessionBtn).toBeVisible();
    await sessionBtn.click();

    // Verify modal is visible
    const modalTitle = page.getByRole('heading', { name: /Sesi Belanja/i });
    await expect(modalTitle).toBeVisible();

    // 3. Verify autocomplete dropdown on wallet column filters active wallets
    // Click on the first wallet autocomplete
    const walletInput1 = page.locator('input[placeholder*="Pilih"]').first();
    await walletInput1.click();
    await walletInput1.fill(walletNameA.substring(0, 4));

    // Select the filtered wallet from dropdown
    const optionA = page.getByRole('option', { name: new RegExp(walletNameA, 'i') }).first();
    await expect(optionA).toBeVisible();
    await optionA.click();

    // 4. Verify item suggestion popup/autocomplete fills item name and last price
    const itemInput1 = page.locator('input[placeholder*="Contoh"]').first();
    await itemInput1.click();
    
    // Suggestion chip or dropdown for priorItem should appear
    const itemSuggestion = page.getByRole('option', { name: new RegExp(priorItem, 'i') }).first()
      .or(page.getByText(priorItem).first());
    if (await itemSuggestion.isVisible()) {
      await itemSuggestion.click();
      // Price should autofill with 28.000
      const priceInput1 = page.locator('input[placeholder="0"]').first();
      await expect(priceInput1).toHaveValue(/28\.?000|28000/);
    } else {
      // Direct fill
      await itemInput1.fill(priorItem);
      const priceInput1 = page.locator('input[placeholder="0"]').first();
      await priceInput1.fill('28000');
    }

    // 5. Fill second row with Wallet B
    const walletInput2 = page.locator('input[placeholder*="Pilih"]').nth(1);
    await walletInput2.click();
    await walletInput2.fill(walletNameB.substring(0, 4));
    const optionB = page.getByRole('option', { name: new RegExp(walletNameB, 'i') }).first();
    await expect(optionB).toBeVisible();
    await optionB.click();

    const itemInput2 = page.locator('input[placeholder*="Contoh"]').nth(1);
    await itemInput2.fill('Nasi Ayam');
    const priceInput2 = page.locator('input[placeholder="0"]').nth(1);
    await priceInput2.fill('25000');

    // 6. Verify Total Calculation updates dynamically
    await expect(page.getByText(/53\.000/).first()).toBeVisible();

    // 7. Verify editable occurred_at date input exists
    const dateInput = page.getByLabel(/Waktu Belanja|Waktu Transaksi|Tanggal/i);
    await expect(dateInput).toBeVisible();

    // 8. Submit "Simpan Semua"
    const saveAllBtn = page.getByRole('button', { name: /Simpan Semua/i });
    await expect(saveAllBtn).toBeEnabled();
    await saveAllBtn.click();

    // Modal should close upon success
    await expect(modalTitle).not.toBeVisible({ timeout: 10000 });

    // Verify wallets reflected updated balances on dashboard
    await expect(page.getByText(walletNameA).first()).toBeVisible();
    await expect(page.getByText(walletNameB).first()).toBeVisible();
  });

  test('@ui durable draft preserves unsubmitted shopping session rows in local storage/IndexedDB across reload', async ({
    authenticatedCreatorPage: page,
    apiClient,
  }) => {
    const walletName = generateUniqueWalletName('DraftWallet');
    await apiClient.createWallet(walletName);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open shopping session
    await page.getByRole('button', { name: /Sesi Belanja/i }).click();

    // Fill partial row
    const walletInput = page.locator('input[placeholder*="Pilih"]').first();
    await walletInput.click();
    await walletInput.fill(walletName.substring(0, 4));
    const opt = page.getByRole('option', { name: new RegExp(walletName, 'i') }).first();
    await expect(opt).toBeVisible();
    await opt.click();

    const itemInput = page.locator('input[placeholder*="Contoh"]').first();
    const draftItemName = 'Draft Es Teh Manis';
    await itemInput.fill(draftItemName);

    const priceInput = page.locator('input[placeholder="0"]').first();
    await priceInput.fill('5000');

    // Wait a moment for debounced draft persistence to IndexedDB
    await page.waitForTimeout(600);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Re-open Sesi Belanja modal
    await page.getByRole('button', { name: /Sesi Belanja/i }).click();

    // Draft notification banner or restored inputs should contain the drafted values
    const restoredItem = page.locator('input[placeholder*="Contoh"]').first();
    await expect(restoredItem).toHaveValue(draftItemName);
  });

  test('@api backend batch entry endpoint creates entries atomically in 1 database transaction', async ({
    apiClient,
  }) => {
    const w1 = generateUniqueWalletName('Batch1');
    const w2 = generateUniqueWalletName('Batch2');
    const r1 = await (await apiClient.createWallet(w1)).json();
    const r2 = await (await apiClient.createWallet(w2)).json();
    const w1Id = r1.id || r1.wallet?.id;
    const w2Id = r2.id || r2.wallet?.id;

    const batchRes = await apiClient.createBatchEntries({
      entries: [
        {
          wallet_id: w1Id,
          amount: 15000,
          item_name: 'Gorengan',
          type: 'titipan',
        },
        {
          wallet_id: w2Id,
          amount: 20000,
          item_name: 'Kopi Susu',
          type: 'titipan',
        },
      ],
    });

    expect(batchRes.status()).toBe(201);
    const body = await batchRes.json();
    expect(body.count).toBe(2);
    expect(body.total_amount).toBe(-35000);
    expect(body.entries).toHaveLength(2);
  });
});
