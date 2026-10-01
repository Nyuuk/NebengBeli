import { BrowserContext, Page } from '@playwright/test';

/**
 * Grant clipboard permissions and read text from the browser clipboard.
 */
export async function grantClipboardPermissions(context: BrowserContext): Promise<void> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
}

export async function readClipboardText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  });
}
