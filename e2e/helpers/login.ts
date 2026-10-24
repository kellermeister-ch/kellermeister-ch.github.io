import { expect, type Page } from '@playwright/test';
import { POD_ORIGIN } from './pod';

/** Host:port of the e2e Pod, e.g. "localhost:3001" — used to detect redirects. */
const podHost = POD_ORIGIN.replace(/^https?:\/\//, '');

/** WebID of the pre-seeded test account on the self-started e2e Pod. */
export const TEST_WEBID = `${POD_ORIGIN}/edwin/profile/card#me`;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Create e2e/.env (see e2e/.env.example) with the test account credentials.`,
    );
  }
  return value;
}

/**
 * Drives the full Solid OIDC login flow through the app's own UI:
 *   Sync button → WebID dialog → Pod login form → consent → redirect back.
 *
 * Pressing "Sync" while logged out both starts the login flow and remembers a
 * pending sync, so the account's Pod data is pulled in once the session is
 * restored. Leaves the app on the landing page in an authenticated state.
 */
export async function login(page: Page, webId: string = TEST_WEBID): Promise<void> {
  const email = requiredEnv('E2E_EMAIL');
  const password = requiredEnv('E2E_PASSWORD');

  await page.goto('/');

  // The Sync button ("Sync - Nur lokal" before the first sync) triggers login
  // when pressed while logged out.
  await page.getByRole('button', { name: /Sync/i }).click();

  // WebID dialog. On a fresh browser there is no history, so the URL input is
  // shown directly; fill it and confirm.
  const webIdInput = page.locator('.dialog-input');
  await expect(webIdInput).toBeVisible();
  await webIdInput.fill(webId);
  await page.getByRole('button', { name: /^OK$/ }).click();

  // The app resolves the OIDC issuer and redirects to the Pod's login page.
  await page.waitForURL((url) => url.href.includes(podHost), { timeout: 30_000 });

  await completePodLogin(page, email, password);

  // Back on the app, authenticated. Pressing Sync while logged out remembered a
  // pending sync that now runs and pulls the account's data from the Pod. The
  // landing page only re-reads its cellar list once that sync *finishes*
  // (syncing → done), so the Pod cellars (e.g. "Hütte") appear only then. This
  // can take a while for a large Pod, so wait generously.
  await page.waitForURL((url) => !url.href.includes(podHost), { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Hütte' })).toBeVisible({ timeout: 150_000 });
  // The sync progress dialog closes by itself shortly after the sync; wait for
  // it so it doesn't cover what the test clicks next.
  await expect(page.locator('sync-progress-dialog .overlay')).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Fills the Community Solid Server login form and clicks through the consent
 * screen. Selectors are intentionally forgiving because the exact markup and
 * whether a consent step is shown vary between CSS versions and prior "remember"
 * state.
 */
async function completePodLogin(page: Page, email: string, password: string): Promise<void> {
  const emailField = page
    .getByLabel(/email/i)
    .or(page.locator('input[name="email"]'))
    .or(page.locator('input[type="email"]'))
    .first();
  await expect(emailField).toBeVisible({ timeout: 30_000 });
  await emailField.fill(email);

  const passwordField = page
    .getByLabel(/password/i)
    .or(page.locator('input[name="password"]'))
    .or(page.locator('input[type="password"]'))
    .first();
  await passwordField.fill(password);

  await page
    .getByRole('button', { name: /log ?in|sign ?in|authenticate/i })
    .or(page.locator('button[type="submit"], input[type="submit"]'))
    .first()
    .click();

  // Consent / authorize screen — only present on first authorization. Click it
  // if it appears within a short window; otherwise assume already authorized.
  const authorize = page
    .getByRole('button', { name: /authorize|consent|continue|allow|zustimmen|erlauben/i })
    .first();
  try {
    await authorize.waitFor({ state: 'visible', timeout: 5_000 });
    await authorize.click();
  } catch {
    // No consent step shown — proceed.
  }
}
