import { test, expect, type Page } from '@playwright/test';
import { login } from '../helpers/login';

/**
 * The sync progress dialog, observed during the post-login sync, which pulls the
 * whole seed Pod and so runs well past the dialog's show delay. Values are read
 * at run time (see the seed-drift note in the README), not fixed counts.
 */

const dialog = (page: Page) => page.locator('sync-progress-dialog [role="dialog"]');

interface Observed {
  labels: string[];
  counts: string[];
}

/** Wait for the dialog to open, then read its rows once a container count is known. */
async function observeDialog(page: Page): Promise<Observed> {
  await expect(dialog(page)).toBeVisible({ timeout: 150_000 });
  await expect(dialog(page).getByText(/^\d+\/\d+$/).first()).toBeVisible({ timeout: 150_000 });
  await page.screenshot({ path: 'test-results/sync-progress-dialog.png' });
  return {
    labels: await dialog(page).locator('.label').allTextContents(),
    counts: await dialog(page).locator('.count').allTextContents(),
  };
}

/** The sync steps in the order the spec requires. */
const STEPS = ['profile', 'prepare', 'pull', 'push', 'finish'];

/** Collect the steps SyncCoordinator logs ("run: step <step>") as the sync goes through them. */
function recordSteps(page: Page): string[] {
  const steps: string[] = [];
  page.on('console', (msg) => {
    const match = /^run: step (\w+)$/.exec(msg.text());
    if (match) steps.push(match[1]);
  });
  return steps;
}

/** The dialog shows the finished run as complete at 100 % before it closes by itself. */
async function observeCompletion(page: Page): Promise<void> {
  await expect(dialog(page).getByText('Abgeschlossen')).toBeVisible({ timeout: 150_000 });
  await expect(dialog(page).locator('.percent')).toHaveText('100 %');
}

test('the post-login sync shows a progress dialog that closes by itself', async ({ page }) => {
  const steps = recordSteps(page);
  // login() returns only after the sync finished and the dialog has closed.
  const [observed] = await Promise.all([
    observeDialog(page).then(async (rows) => {
      await observeCompletion(page);
      return rows;
    }),
    login(page),
  ]);

  expect(steps).toEqual(STEPS);

  expect(observed.labels).toEqual(['Keller', 'Weine', 'Flaschen', 'Bestellungen']);
  for (const count of observed.counts) {
    expect(count).toMatch(/^(\d+\/\d+|…)$/);
  }
  expect(observed.counts.some((count) => /^\d+\/\d+$/.test(count))).toBe(true);

  await expect(dialog(page)).toHaveCount(0);
});

test('"Im Hintergrund" hides the dialog for the rest of the run while the sync continues', async ({ page }) => {
  const dismissAndWatch = async () => {
    await expect(dialog(page)).toBeVisible({ timeout: 150_000 });
    await dialog(page).getByRole('button', { name: 'Im Hintergrund' }).click();
    await expect(dialog(page)).toHaveCount(0);
    // The sync keeps running in the background...
    await expect(page.getByRole('button', { name: 'Synchronisiert…' })).toBeVisible();
    // ...and the dialog does not come back for this run.
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500);
      await expect(dialog(page)).toHaveCount(0);
    }
  };
  await Promise.all([dismissAndWatch(), login(page)]);
});
