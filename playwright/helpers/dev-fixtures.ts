import { APIRequestContext, APIResponse } from '@playwright/test';
import { execSync } from 'child_process';
import { DEFAULT_PASSWORD } from './test-data';

/**
 * Dev fixtures helper for local testing environment.
 */
export async function getDevStatus(request: APIRequestContext): Promise<{ enabled: boolean; environment?: string }> {
  try {
    const res = await request.get('/api/dev/status');
    if (!res.ok()) return { enabled: false };
    const body = await res.json();
    return { enabled: !!body.enabled, environment: body.environment };
  } catch {
    return { enabled: false };
  }
}

export async function resetDevFixtures(request: APIRequestContext): Promise<APIResponse> {
  return request.post('/api/dev/fixtures/reset', { data: {} });
}

export async function seedDevFixtures(
  request: APIRequestContext,
  scenario = 'standard',
  password = DEFAULT_PASSWORD
): Promise<APIResponse> {
  return request.post('/api/dev/fixtures/seed', {
    data: { scenario, password },
  });
}

import path from 'path';

/**
 * Ensure an admin user exists via CLI command or dev seeding.
 */
export function ensureAdminUserCLI(username = 'e2e_admin', password = DEFAULT_PASSWORD): void {
  try {
    const rootDir = path.resolve(__dirname, '../..');
    execSync(
      `docker compose -f "${path.join(rootDir, 'docker-compose.yml')}" exec -T backend /app/nebengbeli-cli create-admin -username "${username}" -password "${password}"`,
      { stdio: 'pipe', cwd: rootDir }
    );
  } catch (err) {
    // If docker compose is not accessible in host subshell, dev seed fallback can be used
    console.warn(`ensureAdminUserCLI note: ${err}`);
  }
}
