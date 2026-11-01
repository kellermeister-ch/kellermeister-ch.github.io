import { test, expect } from '../fixtures/auth';
import type { Page } from '@playwright/test';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { completePodLogin } from '../helpers/login';
import { createAccount, podCollectionDir, POD_ORIGIN, type PodAccount } from '../helpers/pod';

/**
 * WebID switch with a choice of which data to keep (change
 * `choose-data-on-pod-switch`). The authed fixture logs in as the seeded `edwin`
 * account and syncs its Pod; each test then switches to a fresh second account
 * created on the throwaway e2e Pod, and checks both Pods on disk.
 */
const COLLECTIONS = ['cellars', 'products', 'bottles', 'orders'];
const POD_ONLY = 'ffffffff-pod-only$.ttl';

/** Document file names of a Pod's Kellermeister collection (none if absent). */
function podFiles(podName: string, collection: string): string[] {
  const dir = podCollectionDir(podName, collection);
  return existsSync(dir) ? readdirSync(dir).filter((file) => !file.startsWith('.')).sort() : [];
}

/** File name → modification time of all of a Pod's Kellermeister documents. */
function podSnapshot(podName: string): Record<string, number> {
  const snapshot: Record<string, number> = {};
  for (const collection of COLLECTIONS) {
    for (const file of podFiles(podName, collection)) {
      snapshot[`${collection}/${file}`] = statSync(join(podCollectionDir(podName, collection), file)).mtimeMs;
    }
  }
  return snapshot;
}

/** Give the second Pod a Kellermeister bottle of its own, which a switch keeping the local data must erase. */
function seedPodOnlyBottle(account: PodAccount): void {
  const target = podCollectionDir(account.name, 'bottles');
  mkdirSync(target, { recursive: true });
  const [source] = podFiles('edwin', 'bottles');
  copyFileSync(join(podCollectionDir('edwin', 'bottles'), source), join(target, POD_ONLY));
}

/** Log out, then log in as `account` through the Sync button, answering the switch dialog with `choice`. */
async function switchTo(page: Page, account: PodAccount, choice: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Kellerprofil' }).click();
  await page.getByRole('button', { name: 'Logout' }).click();
  // The Pod remembers edwin's login in a cookie, which would skip the login form.
  await page.context().clearCookies();
  await page.goto('/');

  await page.getByRole('button', { name: /Sync/i }).first().click();
  // With a WebID history the dialog offers a list first; a new WebID is typed in.
  await expect(page.getByRole('dialog', { name: 'WebID eingeben' })).toBeVisible();
  const history = page.locator('.dialog select');
  if (await history.count() > 0) {
    await history.selectOption({ label: '— Neue WebID eingeben —' });
  }
  await page.locator('.dialog-input').fill(account.webId);
  await page.getByRole('button', { name: /^OK$/ }).click();

  // The choice is asked before the login flow leaves the app.
  await expect(page.getByRole('dialog', { name: 'Andere WebID' })).toBeVisible();
  await page.getByRole('button', { name: choice }).click();

  const podHost = POD_ORIGIN.replace(/^https?:\/\//, '');
  await page.waitForURL((url) => url.href.includes(podHost), { timeout: 30_000 });
  await completePodLogin(page, account.email, account.password);
  await page.waitForURL((url) => !url.href.includes(podHost), { timeout: 30_000 });
  // Not asked a second time after the redirect.
  await expect(page.getByRole('dialog', { name: 'Andere WebID' })).toHaveCount(0);
}

test.describe('Pod switch', () => {
  test('keeping the local data replaces the other Pod\'s Kellermeister data with it', async ({ authedPage: page }) => {
    test.setTimeout(420_000);
    page.on('console', (msg) => {
      if (msg.type() === 'error' || /run: |sync|replace/i.test(msg.text())) console.log('[browser]', msg.text());
    });
    const second = await createAccount(`second-${Date.now()}`);
    seedPodOnlyBottle(second);
    const edwinBefore = podSnapshot('edwin');

    await switchTo(page, second, /Lokale Daten behalten/);

    // The local data is still shown, now for the second identity.
    await expect(page.getByRole('button', { name: 'Hütte' })).toBeVisible({ timeout: 30_000 });

    // The remembered sync replaces the second Pod's data and uploads the local
    // data: afterwards the second Pod holds exactly edwin's documents.
    for (const collection of COLLECTIONS) {
      await expect
        .poll(() => podFiles(second.name, collection).join(), { timeout: 240_000, message: `${collection} not uploaded` })
        .toBe(podFiles('edwin', collection).join());
    }
    expect(podFiles(second.name, 'bottles')).not.toContain(POD_ONLY);

    // Every uploaded reference points to the second Pod, none to edwin's.
    for (const collection of COLLECTIONS) {
      for (const file of podFiles(second.name, collection)) {
        const content = readFileSync(join(podCollectionDir(second.name, collection), file), 'utf8');
        expect(content, `${collection}/${file}`).not.toContain(`${POD_ORIGIN}/edwin/`);
      }
    }

    // edwin's Pod is untouched.
    expect(podSnapshot('edwin')).toEqual(edwinBefore);
  });

  test('keeping the Pod\'s data deletes the local data', async ({ authedPage: page }) => {
    const second = await createAccount(`second-${Date.now()}`);
    const edwinBefore = podSnapshot('edwin');

    await switchTo(page, second, /Daten aus dem Pod übernehmen/);

    // A fresh start for the second identity: only the well-known cellars.
    await expect(page.getByRole('button', { name: 'Eingang' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Altglass' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hütte' })).toHaveCount(0);

    // Neither Pod received anything.
    expect(podSnapshot('edwin')).toEqual(edwinBefore);
    expect(COLLECTIONS.flatMap((collection) => podFiles(second.name, collection))).toEqual([]);
  });
});
