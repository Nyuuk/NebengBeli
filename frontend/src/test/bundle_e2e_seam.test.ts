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

    // Test 2: the known Camofox bridge is enabled only with explicit local test intent.
    const bridgeDom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      url: 'http://172.17.0.1:8088/',
      runScripts: 'dangerously',
    });
    (bridgeDom.window as unknown as { __E2E_MODE__?: boolean }).__E2E_MODE__ = true;
    bridgeDom.window.eval(evalCode);
    expect(bridgeDom.window.__NEBENGBELI_E2E__).toBeDefined();

    const bridgeWithoutIntentDom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
      url: 'http://172.17.0.1:8088/',
      runScripts: 'dangerously',
    });
    bridgeWithoutIntentDom.window.eval(evalCode);
    expect(bridgeWithoutIntentDom.window.__NEBENGBELI_E2E__).toBeUndefined();

    // Test 3: production, staging, and arbitrary private hosts remain inert.
    for (const url of [
      'https://nebengbeli.nyuuk.my.id/',
      'https://staging.nebengbeli.internal/',
      'http://192.168.1.100:8088/',
      'http://10.0.0.1:8088/',
      'http://172.17.0.2:8088/',
    ]) {
      const restrictedDom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
        url,
        runScripts: 'dangerously',
      });
      (restrictedDom.window as unknown as { __E2E_MODE__?: boolean }).__E2E_MODE__ = true;
      restrictedDom.window.eval(evalCode);
      expect(restrictedDom.window.__NEBENGBELI_E2E__).toBeUndefined();
    }
  }, 30000);

  it('builds frontend with VITE_E2E_MODE=true and verifies explicit test intent HTML preload', async () => {
    // Set VITE_E2E_MODE=true for build
    process.env.VITE_E2E_MODE = 'true';

    try {
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

      const htmlAsset = outputChunks.find(
        (c): c is Rollup.OutputAsset => c.type === 'asset' && c.fileName.endsWith('.html')
      );
      expect(htmlAsset).toBeDefined();
      const htmlSource = typeof htmlAsset?.source === 'string' ? htmlAsset.source : htmlAsset?.source.toString() || '';

      // Assertion: In E2E build, the HTML must contain preloaded explicit test intent
      expect(htmlSource).toContain('window.__E2E_MODE__ = true;');

      const jsChunk = outputChunks.find(
        (c): c is Rollup.OutputChunk => c.type === 'chunk' && c.fileName.endsWith('.js')
      );
      expect(jsChunk).toBeDefined();
      const bundleCode = jsChunk?.code || '';
      const evalCode = bundleCode.replace(/import\.meta/g, '({env:{DEV:false,MODE:"production"}})');

      // Test Camofox bridge host with preloaded HTML script execution
      const bridgeDom = new JSDOM(htmlSource, {
        url: 'http://172.17.0.1:8088/',
        runScripts: 'dangerously',
      });

      // The preloaded script has already run in JSDOM head before bundle execution
      expect((bridgeDom.window as unknown as { __E2E_MODE__?: boolean }).__E2E_MODE__).toBe(true);

      // Execute Vite bundle
      bridgeDom.window.eval(evalCode);
      expect(bridgeDom.window.__NEBENGBELI_E2E__).toBeDefined();
      expect(typeof bridgeDom.window.__NEBENGBELI_E2E__?.setOffline).toBe('function');

      // Verify that production hosts remain inert even with preloaded build
      const prodDom = new JSDOM(htmlSource, {
        url: 'https://nebengbeli.nyuuk.my.id/',
        runScripts: 'dangerously',
      });
      prodDom.window.eval(evalCode);
      expect(prodDom.window.__NEBENGBELI_E2E__).toBeUndefined();
    } finally {
      delete process.env.VITE_E2E_MODE;
    }
  }, 30000);

  it('verifies default build has no E2E preload script (fail-closed in production)', async () => {
    delete process.env.VITE_E2E_MODE;

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

    const htmlAsset = outputChunks.find(
      (c): c is Rollup.OutputAsset => c.type === 'asset' && c.fileName.endsWith('.html')
    );
    expect(htmlAsset).toBeDefined();
    const htmlSource = typeof htmlAsset?.source === 'string' ? htmlAsset.source : htmlAsset?.source.toString() || '';

    // Must NOT contain E2E preload script
    expect(htmlSource).not.toContain('window.__E2E_MODE__');
  }, 30000);
});

