// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { build, type Rollup } from 'vite';
import { JSDOM } from 'jsdom';

declare const __dirname: string;

describe('Deterministic Bundle/Build-level E2E Offline Seam Regression Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const mainTsxPath = path.resolve(rootDir, 'src/main.tsx');

  it('verifies that main.tsx entrypoint explicitly initializes initOfflineNetworkSeam', () => {
    const mainContent = fs.readFileSync(mainTsxPath, 'utf-8');
    expect(mainContent).toMatch(/import\s*\{\s*initOfflineNetworkSeam\s*\}\s*from\s*['"]\.\/offline\/networkMode['"]/);
    expect(mainContent).toMatch(/initOfflineNetworkSeam\s*\(\s*\)/);
  });

  it('builds production bundle with Vite and verifies window.__NEBENGBELI_E2E__ behavior', async () => {
    // Perform a deterministic production build into in-memory output
    const buildResult = await build({
      root: rootDir,
      logLevel: 'silent',
      build: {
        write: false,
        minify: true,
      },
    });

    const outputChunks = (
      Array.isArray(buildResult)
        ? buildResult[0].output
        : (buildResult as Rollup.RollupOutput).output
    ) as Array<Rollup.OutputChunk | Rollup.OutputAsset>;
    const jsChunk = outputChunks.find(
      (c): c is Rollup.OutputChunk => c.type === 'chunk' && c.fileName.endsWith('.js')
    );
    expect(jsChunk).toBeDefined();
    expect(jsChunk?.code).toBeDefined();

    const bundleCode = jsChunk?.code || '';

    // Assertion: bundle must contain reference to __NEBENGBELI_E2E__
    expect(bundleCode).toContain('__NEBENGBELI_E2E__');

    // Replace import.meta with standard production object for script eval in jsdom
    const evalCode = bundleCode.replace(/import\.meta/g, '({env:{DEV:false,MODE:"production"}})');

    // Test 1: Evaluate bundle on loopback localhost
    const localDom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      url: 'http://localhost:8088/',
      runScripts: 'dangerously',
    });

    localDom.window.eval(evalCode);
    const localE2E = localDom.window.__NEBENGBELI_E2E__;

    expect(localE2E).toBeDefined();
    expect(typeof localE2E?.setOffline).toBe('function');
    expect(typeof localE2E?.isOffline).toBe('function');
    expect(typeof localE2E?.syncNow).toBe('function');
    expect(typeof localE2E?.getPendingCount).toBe('function');
    expect(typeof localE2E?.resetOfflineState).toBe('function');

    // Test 2: Evaluate bundle on non-localhost production domain (e.g. nebengbeli.nyuuk.my.id)
    const prodDom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      url: 'https://nebengbeli.nyuuk.my.id/',
      runScripts: 'dangerously',
    });

    prodDom.window.eval(evalCode);
    const prodE2E = prodDom.window.__NEBENGBELI_E2E__;

    // Must be completely undefined and inert in production
    expect(prodE2E).toBeUndefined();
  }, 30000);
});
