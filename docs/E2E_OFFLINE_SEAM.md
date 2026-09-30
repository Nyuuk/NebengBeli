# Local-Only Frontend E2E Offline Network-Mode Control Seam

NebengBeli features an offline-first architecture with IndexedDB client queueing and automatic background synchronization upon reconnection (PRD F11).

To enable deterministic and reliable browser-level E2E automated tests (e.g. Camofox, Playwright, Vitest) without modifying container networking or disconnecting the test runner, the application exposes a **Local-Only E2E Offline Network-Mode Control Seam** (`frontend/src/offline/networkMode.ts`).

---

## 1. Security & Fail-Closed Guardrails

1. **Loopback Localhost & Bridge Intent Guard**: The seam is initialized at entrypoint (`src/main.tsx` via `initOfflineNetworkSeam()`) and is strictly active on loopback localhost (`localhost`, `127.0.0.1`, `::1`), Vite `DEV`/`test` mode, or on the Docker bridge host (`172.17.0.1`) when explicit test intent (`__E2E_MODE__`) is present.
2. **Local E2E Preload in Compose Path**: For containerized local browser testing against the Docker bridge (`172.17.0.1`), the Compose build path injects a safe preload script (`window.__E2E_MODE__ = true;`) via `VITE_E2E_MODE=true` into the HTML `<head>` before the bundle executes. Standard/production builds default to `VITE_E2E_MODE=false` (fail-closed).
3. **Production & Non-Localhost Immunity**: In non-localhost, private LAN, staging, or public production deployments (e.g. `nebengbeli.nyuuk.my.id`, `nebengbeli.com`), any attempt to attach or force offline mode is rejected, inert, and ignored, ensuring that user traffic operates strictly with true `navigator.onLine` status.
4. **Fail-Closed Client Requests**: When simulated offline mode is active, `client.ts` rejects immediately with `ApiError('You are currently offline (E2E simulation mode)', 0)` before issuing any network requests.


---

## 2. Browser Automation Window API

In development/local loopback environments, the helper object `window.__NEBENGBELI_E2E__` is attached to `window`:

```javascript
// Simulate offline state
window.__NEBENGBELI_E2E__.setOffline(true);

// Check if currently simulated or physically offline
const isOffline = window.__NEBENGBELI_E2E__.isOffline();

// Check number of pending transactions in IndexedDB queue
const pendingCount = await window.__NEBENGBELI_E2E__.getPendingCount();

// Simulate reconnection (automatically triggers sync)
window.__NEBENGBELI_E2E__.setOffline(false);

// Manually trigger immediate sync replay
const { synced, failed } = await window.__NEBENGBELI_E2E__.syncNow();

// Reset simulated network state
window.__NEBENGBELI_E2E__.resetOfflineState();
```

---

## 3. Events Dispatched

When network state is modified through the seam, the application fires:
- Custom Event: `nebengbeli:network-mode-change` with `detail: { isOffline, isOnline }`
- Standard DOM Events: `window.dispatchEvent(new Event('offline'))` or `window.dispatchEvent(new Event('online'))`

The React `OnlineStatusContext` listens to these events, updating the UI badge (`OfflineBadge`) and triggering queue synchronization automatically upon returning online.

---

## 4. E2E Test Recipes

### Example: Playwright / Camofox Offline Recording Test

```typescript
// 1. Navigate to wallet page
await page.goto('https://localhost:8443/wallets/' + walletId);

// 2. Switch to simulated offline mode
await page.evaluate(() => window.__NEBENGBELI_E2E__.setOffline(true));

// 3. Record offline entry
await page.click('button:has-text("Catat Titipan")');
await page.fill('input[name="item_name"]', 'Kopi Susu Dingin');
await page.fill('input[name="amount"]', '20000');
await page.click('button:has-text("Simpan")');

// 4. Verify offline badge shows pending queue
await expect(page.locator('text=1 antrean offline')).toBeVisible();

// 5. Switch back to online
await page.evaluate(() => window.__NEBENGBELI_E2E__.setOffline(false));

// 6. Verify sync completed
await expect(page.locator('text=1 antrean offline')).not.toBeVisible();
await expect(page.locator('text=Kopi Susu Dingin')).toBeVisible();
```
