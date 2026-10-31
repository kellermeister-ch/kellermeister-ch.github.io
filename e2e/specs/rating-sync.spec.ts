import { test, expect } from '../fixtures/auth';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/**
 * A rating given in the app must reach the Pod (change `sync-bottle-rating`).
 *
 * The rated bottle is one of Hütte's, i.e. it already exists on the Pod, so the
 * sync has to merge it into the existing Pod document — the path that used to
 * drop the rating (an embedded node the merge did not transfer). The result is
 * checked on the e2e Pod's files on disk, independent of the app's local state.
 */
const specsDir = dirname(fileURLToPath(import.meta.url));
const podBottlesDir = resolve(specsDir, '..', '.pod-data', 'edwin', 'private', 'kellermeister', 'v1', 'bottles');

const RATING_VALUE = '<https://vocab.kellermeister.ch/wine/ratingValue>';
const RATED_AT = '<https://vocab.kellermeister.ch/wine/ratedAt>';

/** Pod bottle files (name → content) that carry a rating in the bottle-property form. */
function ratedPodBottles(): Map<string, string> {
  const rated = new Map<string, string>();
  for (const file of readdirSync(podBottlesDir)) {
    const content = readFileSync(join(podBottlesDir, file), 'utf8');
    if (content.includes(`${RATING_VALUE} 3`) && content.includes(RATED_AT)) {
      rated.set(file, content);
    }
  }
  return rated;
}

test.describe('Rating sync', () => {
  test('a rating given at disposal is written to the bottle on the Pod', async ({ authedPage: page }) => {
    const ratedBefore = ratedPodBottles();

    await page.getByRole('button', { name: 'Hütte' }).click();
    await page.waitForURL(/\/cellar\//);
    const button = page.locator('li .bottle-button').first();
    await expect(button).toBeVisible({ timeout: 30_000 });
    const count = Number(await button.textContent());

    // Rate one bottle 3 and dispose it to Altglass.
    await button.click();
    await page.locator('.rating-button').filter({ hasText: /^3$/ }).click();
    await page.locator('.rating-action.confirm').click();
    if (count > 1) {
      await expect(button).toHaveText(String(count - 1));
    }

    // The Sync button lives on the landing page.
    await page.getByRole('button', { name: 'Übersicht' }).click();
    await page.getByRole('button', { name: /Sync/i }).first().click();

    // Exactly one more Pod bottle now carries the rating.
    await expect
      .poll(() => [...ratedPodBottles().keys()].filter((file) => !ratedBefore.has(file)).length, {
        timeout: 60_000,
        message: 'the rated bottle did not reach the Pod',
      })
      .toBe(1);
  });
});
