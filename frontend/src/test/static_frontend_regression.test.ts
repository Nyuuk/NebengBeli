// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizeApiBaseUrl } from '../api/client';
import * as fsModule from 'fs';
import * as pathModule from 'path';

// Relax ts checks for Node built-ins in Vitest Node runner
const fs = fsModule as any;
const path = pathModule as any;

describe('Frontend Static-Only & API Client Regression Suite', () => {
  const rootDir = process.cwd();
  const repoRoot = path.resolve(rootDir, '..');
  const frontendRoot = rootDir;

  it('verifies that client.ts configures API_BASE_URL from VITE_API_URL and trims trailing slashes', () => {
    const clientPath = path.resolve(frontendRoot, 'src/api/client.ts');
    const clientCode = fs.readFileSync(clientPath, 'utf-8');

    expect(clientCode).toContain("import.meta.env.VITE_API_URL ?? ''");
    expect(clientCode).toContain(".replace(/\\/+$/, '')");
    expect(clientCode).toContain('normalizeApiBaseUrl(import.meta.env.VITE_API_URL ?? \'\')');
    expect(clientCode).toContain('`${API_BASE_URL}${path}`');
    expect(normalizeApiBaseUrl('https://dev-nebengbeli.kangoprek.my.id/api')).toBe('https://dev-nebengbeli.kangoprek.my.id');
    expect(normalizeApiBaseUrl('https://dev-nebengbeli.kangoprek.my.id/api/')).toBe('https://dev-nebengbeli.kangoprek.my.id');
    expect(normalizeApiBaseUrl('')).toBe('');
  });

  it('verifies CSV export URLs use the configured API base while preserving relative defaults', () => {
    const statementsPath = path.resolve(frontendRoot, 'src/api/statements.ts');
    const statementsCode = fs.readFileSync(statementsPath, 'utf-8');

    expect(statementsCode).toContain('import { API_BASE_URL, request } from \'./client\'');
    expect(statementsCode).toContain('`${API_BASE_URL}/api/wallets/${walletId}/statement/export');
  });

  it('verifies all API modules use relative /api/ endpoints', () => {
    const apiDir = path.resolve(frontendRoot, 'src/api');
    const apiFiles: string[] = fs.readdirSync(apiDir).filter((f: string) => f.endsWith('.ts') && f !== 'client.ts');

    expect(apiFiles.length).toBeGreaterThan(0);

    for (const file of apiFiles) {
      const content = fs.readFileSync(path.resolve(apiDir, file), 'utf-8');

      // Ensure no hardcoded absolute http:// or https:// backend hosts in API modules
      expect(content).not.toMatch(/https?:\/\/(?!localhost|127\.0\.0\.1)/);

      // Extract all endpoint strings passed to request() or endpoint constants
      const endpointMatches = content.match(/['"`]\/(?:api|[a-zA-Z0-9_\-\/${}]+)['"`]/g) || [];
      for (const ep of endpointMatches) {
        const cleaned = ep.replace(/['"`]/g, '');
        // Every route path must be relative and start with /api/
        expect(cleaned).toMatch(/^\/api\//);
      }
    }
  });

  it('verifies nginx.conf is static-only, unprivileged, and serves direct healthz', () => {
    const nginxPath = path.resolve(repoRoot, 'nginx.conf');
    const nginxContent = fs.readFileSync(nginxPath, 'utf-8');

    // Unprivileged non-root port 8080 and 8443
    expect(nginxContent).toContain('listen 8080;');
    expect(nginxContent).toContain('listen 8443 ssl;');

    // Read-only rootfs temp paths in /tmp
    expect(nginxContent).toContain('pid /tmp/nginx.pid;');
    expect(nginxContent).toContain('client_body_temp_path /tmp/client_temp;');

    // SPA serving fallback
    expect(nginxContent).toContain('try_files $uri $uri/ /index.html;');

    // Direct frontend health endpoint
    expect(nginxContent).toMatch(/location\s*=?\s*\/healthz/);
    expect(nginxContent).toContain('return 200 "OK\\n";');

    // Cache-Control headers for index.html (no-cache) and /assets/ (immutable)
    expect(nginxContent).toContain('location = /index.html');
    expect(nginxContent).toContain('add_header Cache-Control "no-cache, no-store, must-revalidate" always;');
    expect(nginxContent).toContain('location /assets/');
    expect(nginxContent).toContain('add_header Cache-Control "public, max-age=31536000, immutable" always;');

    // Must NOT contain obsolete backend proxy directives
    expect(nginxContent).not.toContain('proxy_pass');
    expect(nginxContent).not.toContain('location /api/');
    expect(nginxContent).not.toContain('location /readyz');
  });

  it('verifies service-worker.js and sw.js implement cache-v2 and network-first for navigations', () => {
    const swFiles = ['public/service-worker.js', 'public/sw.js'];

    for (const swRelPath of swFiles) {
      const swPath = path.resolve(frontendRoot, swRelPath);
      const swCode = fs.readFileSync(swPath, 'utf-8');

      // Bumped cache version
      expect(swCode).toContain("const CACHE_NAME = 'nebengbeli-cache-v2';");

      // Lifecycle methods
      expect(swCode).toContain('self.skipWaiting()');
      expect(swCode).toContain('self.clients.claim()');

      // Network-first for navigate / index.html
      expect(swCode).toMatch(/event\.request\.mode\s*===\s*'navigate'/);
      expect(swCode).toContain('/index.html');

      // Ignores api and health endpoints
      expect(swCode).toContain('/api/');
      expect(swCode).toContain('/healthz');
      expect(swCode).toContain('/readyz');
    }
  });

  it('verifies AuthContext cleans up visibilitychange and focus listeners', () => {
    const authPath = path.resolve(frontendRoot, 'src/context/AuthContext.tsx');
    const authCode = fs.readFileSync(authPath, 'utf-8');

    expect(authCode).toContain("document.addEventListener('visibilitychange', handleVisibilityChange);");
    expect(authCode).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange);");
    expect(authCode).toContain("window.removeEventListener('focus', handleFocus);");
  });

  it('verifies Dockerfile.frontend runs as unprivileged non-root nginx user on port 8080/8443', () => {
    const dockerfilePath = path.resolve(repoRoot, 'Dockerfile.frontend');
    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

    expect(dockerfileContent).toContain('USER nginx');
    expect(dockerfileContent).toContain('EXPOSE 8080 8443');
    expect(dockerfileContent).toContain('chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/certs');
  });
});
