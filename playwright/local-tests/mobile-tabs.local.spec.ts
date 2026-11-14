import { test, expect, type Locator, type Page } from '@playwright/test';

const fixture = '/src/test/mobile-tabs-browser/index.html';

async function mockApi(page: Page) {
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/auth/me': { user: { id: 'local-admin', username: 'local_admin', role: 'admin', created_at: '2026-01-01T00:00:00Z' } },
      '/api/auth/renew': {},
      '/api/wallets': { wallets: [] },
      '/api/insights': {},
      '/api/links': { link_requests: [] },
      '/api/admin/stats': { stats: {
        total_users: 1, total_wallets: 0, active_wallets: 0, archived_wallets: 0,
        total_entries: 0, total_volume: 0, total_audit_logs: 0,
      } },
      '/api/admin/users': { users: [], total: 0 },
      '/api/admin/wallets': { wallets: [], total: 0 },
      '/api/admin/entries': { entries: [], total: 0 },
      '/api/admin/summary': { summary: {} },
      '/api/admin/creators': { creators: [], total: 0 },
      '/api/admin/audit-logs': { audit_logs: [], total: 0 },
      '/api/admin/trends': { trends: {
        daily: [{ label: 'Local daily', count: 1, total_amount: 1 }],
        weekly: [{ label: 'Local weekly', count: 2, total_amount: 2 }],
        monthly: [{ label: 'Local monthly', count: 3, total_amount: 3 }],
      } },
    };
    if (!(path in responses)) throw new Error(`Unmocked API: ${path}`);
    await route.fulfill({ json: responses[path] });
  });
  // Rewrite navigation only in this local browser context; production router unchanged.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (route.request().isNavigationRequest() && ['/', '/admin'].includes(url.pathname)) {
      await route.fulfill({ response: await route.fetch({ url: `${url.origin}${fixture}` }) });
    } else await route.fallback();
  });
}

async function contained(tab: Locator, row: Locator) {
  await expect.poll(async () => {
    return tab.evaluate((el) => {
      const scroller = el.closest('.MuiTabs-root')!.querySelector('.MuiTabs-scroller')!;
      const a = el.getBoundingClientRect();
      const b = scroller.getBoundingClientRect();
      return a.left >= b.left - 1 && a.right <= b.right + 1;
    });
  }).toBe(true);
  await expect(row).toBeVisible();
}

async function noDocumentOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function reachLastWithControls(row: Locator, narrow: boolean) {
  const root = row.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " MuiTabs-root ")]');
  const scroller = root.locator('.MuiTabs-scroller');
  const tabs = row.getByRole('tab');
  const overflowing = await scroller.evaluate(el => el.scrollWidth > el.clientWidth);
  if (narrow) expect(overflowing).toBe(true);
  if (overflowing) {
    const next = root.getByRole('button', { name: 'Geser tab ke kanan' });
    await expect(next).toBeVisible();
    // Real MUI control clicks, never locator.click's automatic scroll-to-target.
    for (let i = 0; i < await tabs.count(); i++) {
      if (await scroller.evaluate(el => el.scrollWidth - el.clientWidth - el.scrollLeft <= 1)) break;
      const before = await scroller.evaluate(el => el.scrollLeft);
      const remaining = await scroller.evaluate(el => el.scrollWidth - el.clientWidth - el.scrollLeft);
      const step = Math.min(remaining, await tabs.first().evaluate(el => el.clientWidth));
      await next.click();
      await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThanOrEqual(before + step - 1);
    }
    await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  }
  await contained(tabs.last(), row);
  await tabs.last().click();
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  // Exercise every choice via the same manual keyboard activation MUI provides.
  await tabs.last().focus();
  await row.page().keyboard.press('Home');
  for (let index = 0; index < await tabs.count(); index++) {
    if (index > 0) await row.page().keyboard.press('ArrowRight');
    await expect(tabs.nth(index)).toBeFocused();
    await row.page().keyboard.press('Enter');
    await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true');
    await contained(tabs.nth(index), row);
  }
}

async function recapLayout(page: Page, info: import('@playwright/test').TestInfo) {
  const dialog = page.getByRole('dialog');
  const measurements = await dialog.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    const dates = [...el.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(input => {
      const field = input.closest('.MuiTextField-root')!;
      const label = field.querySelector('label')!;
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.font = style.font;
      // Reserve the native calendar indicator as well as both input paddings.
      const requiredWidth = context.measureText('00/00/0000').width + 24
        + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      return { width: rect.width, requiredWidth, labelWidth: label.scrollWidth * 0.75,
        availableLabelWidth: field.clientWidth - 28, left: rect.left, right: rect.right };
    });
    const footer = el.querySelector('.MuiDialogActions-root')!;
    const buttons = [...footer.querySelectorAll('button')].map(button => {
      const rect = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      const content = range.getBoundingClientRect();
      return { label: button.textContent, left: rect.left, right: rect.right, top: rect.top,
        bottom: rect.bottom, contentLeft: content.left, contentRight: content.right,
        contentTop: content.top, contentBottom: content.bottom };
    });
    return { left: bounds.left, right: bounds.right, dates, buttons,
      contentOverflow: el.querySelector('.MuiDialogContent-root')!.scrollWidth
        > el.querySelector('.MuiDialogContent-root')!.clientWidth,
      footerOverflow: footer.scrollWidth > footer.clientWidth };
  });
  await info.attach('recap-layout-measurements', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  expect(measurements.dates).toHaveLength(2);
  for (const date of measurements.dates) {
    expect(date.width).toBeGreaterThanOrEqual(date.requiredWidth);
    expect(date.labelWidth).toBeLessThanOrEqual(date.availableLabelWidth);
    expect(date.left).toBeGreaterThanOrEqual(measurements.left);
    expect(date.right).toBeLessThanOrEqual(measurements.right);
  }
  expect(measurements.contentOverflow).toBe(false);
  expect(measurements.footerOverflow).toBe(false);
  expect(measurements.buttons).toHaveLength(3);
  for (const button of measurements.buttons) {
    expect(button.left).toBeGreaterThanOrEqual(measurements.left);
    expect(button.right).toBeLessThanOrEqual(measurements.right);
    expect(button.top).toBeGreaterThanOrEqual(0);
    expect(button.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(button.contentLeft).toBeGreaterThanOrEqual(button.left);
    expect(button.contentRight).toBeLessThanOrEqual(button.right);
    expect(button.contentTop).toBeGreaterThanOrEqual(button.top);
    expect(button.contentBottom).toBeLessThanOrEqual(button.bottom);
  }
  for (let i = 0; i < measurements.buttons.length; i++) {
    for (const other of measurements.buttons.slice(i + 1)) {
      const button = measurements.buttons[i];
      expect(button.right <= other.left || other.right <= button.left
        || button.bottom <= other.top || other.bottom <= button.top).toBe(true);
    }
  }
  if (page.viewportSize()!.width === 1280) {
    expect(measurements.buttons[0].top).toBe(measurements.buttons[1].top);
    const dates = dialog.locator('input[type="date"]');
    expect((await dates.first().boundingBox())!.y).toBe((await dates.last().boundingBox())!.y);
  }
}

for (const width of [320, 360, 390, 430, 1280]) {
  test(`local recap: Custom reachable, date fields and keyboard at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${fixture}?recap`);
    const row = page.getByRole('tablist');
    await expect(row.getByRole('tab')).toHaveCount(4);
    await reachLastWithControls(row, width < 600);
    await expect(page.getByLabel('Tanggal Mulai')).toBeVisible();
    await expect(page.getByLabel('Tanggal Selesai')).toBeVisible();
    await page.getByLabel('Tanggal Mulai').fill('2026-01-01');
    await expect(page.getByLabel('Tanggal Mulai')).toHaveValue('2026-01-01');
    const custom = row.getByRole('tab', { name: 'Custom' });
    await custom.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(row.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(row.getByRole('tab').nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(custom).toHaveAttribute('aria-selected', 'true');
    await contained(custom, row);
    await noDocumentOverflow(page);
    await page.screenshot({ path: info.outputPath(`recap-${width}.png`) });
    await recapLayout(page, info);
    const close = page.getByRole('button', { name: 'Tutup', exact: true });
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Bagikan', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Salin Teks', exact: true })).toBeFocused();
  });

  test(`local dashboard and both admin rows: navigation at ${width}`, async ({ page }, info) => {
    await mockApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const dashboard = page.getByRole('tablist');
    await expect(dashboard.getByRole('tab')).toHaveCount(3);
    await reachLastWithControls(dashboard, width < 600);
    await expect(page.getByText('Tidak Ada Buku yang Diarsipkan', { exact: false })).toBeVisible();
    await noDocumentOverflow(page);
    await page.screenshot({ path: info.outputPath(`dashboard-${width}.png`) });
    await page.goto('/admin');
    const main = page.getByRole('tablist').first();
    await expect(main.getByRole('tab')).toHaveCount(6);
    await reachLastWithControls(main, width < 600);
    // Arrow navigation preserves manual selection and brings the selected offscreen item into view.
    await main.getByRole('tab').last().focus();
    await page.keyboard.press('ArrowLeft');
    const trends = main.getByRole('tab', { name: 'Tren Sistem (Trends)' });
    await expect(trends).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(trends).toHaveAttribute('aria-selected', 'true');
    await contained(trends, main);
    const periods = page.getByRole('tablist').nth(1);
    await expect(periods.getByRole('tab')).toHaveCount(3);
    await reachLastWithControls(periods, width < 600);
    await expect(page.getByText('Local monthly')).toBeVisible();
    await noDocumentOverflow(page);
    await page.screenshot({ path: info.outputPath(`admin-trends-${width}.png`) });
  });
}

test('local recap: date/footer containment and content scrolling at short 320x568', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${fixture}?recap`);
  await reachLastWithControls(page.getByRole('tablist'), true);
  // Prove horizontal bounds before focus/scroll can move controls into view.
  await recapLayout(page, info);
  const content = page.getByRole('dialog').locator('.MuiDialogContent-root');
  expect(await content.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  for (const label of ['Tanggal Mulai', 'Tanggal Selesai']) {
    const input = page.getByLabel(label);
    await input.focus();
    await expect(input).toBeFocused();
    await expect.poll(() => input.evaluate(el => {
      const a = el.getBoundingClientRect();
      const b = el.closest('.MuiDialogContent-root')!.getBoundingClientRect();
      return a.top >= b.top && a.bottom <= b.bottom;
    })).toBe(true);
    await input.fill('2026-01-01');
    await expect(input).toHaveValue('2026-01-01');
  }
  await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Tutup', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Bagikan', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Salin Teks', exact: true })).toBeFocused();
  await noDocumentOverflow(page);
  await page.screenshot({ path: info.outputPath('recap-short-320x568.png') });
});
