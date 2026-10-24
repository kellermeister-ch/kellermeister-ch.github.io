import { test, expect, type Page } from '@playwright/test';
import { login } from '../helpers/login';

/**
 * The cellar header shows the cellar's total bottle count under its name, and
 * "matching von total" while a wine-type or search filter is active.
 *
 * Serial with one shared, logged-in page: the Solid OIDC login is slow, and the
 * later cases build on each other (a bottle is moved into the "Brixen" cellar,
 * then disposed out of it again). Counts are read from the seed at run time and
 * checked relative to that, so the tests don't depend on the seed's exact contents.
 */
test.describe.configure({ mode: 'serial' });

const subtitle = (page: Page) => page.locator('kellermeister-header span[slot="subtitle"]');

/** Sum of the per-product count badges currently listed. */
async function sumOfRowBadges(page: Page): Promise<number> {
  const texts = await page.locator('li .bottle-button').allTextContents();
  return texts.reduce((n, t) => n + Number(t.trim()), 0);
}

/** The cellar total in the header subline: "765 Flaschen" -> 765, "14 von 765 Flaschen" -> 765. */
async function subtitleCount(page: Page): Promise<number> {
  const words = ((await subtitle(page).textContent()) ?? '').trim().split(/\s+/);
  return Number(words[words.length - 2]);
}

/** The header subline for a count: "1 Flasche", otherwise "N Flaschen". */
const countLabel = (n: number): string => `${n} ${n === 1 ? 'Flasche' : 'Flaschen'}`;

/** The header subline while a filter is active: "14 von 765 Flaschen"; the noun follows the total. */
const filteredLabel = (matching: number, total: number): string =>
  `${matching} von ${countLabel(total)}`;

async function openCellar(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForURL(/\/cellar\//);
  await expect(subtitle(page)).toBeVisible({ timeout: 30_000 });
}

test.describe('Cellar header bottle count', () => {
  let page: Page;
  let luzernTotal: number;
  let huetteTotal: number;
  let brixenStart: number;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('shows the cellar total under the cellar name', async () => {
    await openCellar(page, 'Luzern');
    await expect(page.getByRole('heading', { name: /Keller\s+Luzern/ })).toBeVisible();

    await expect(subtitle(page)).toHaveText(/^\d+ Flaschen$/);
    luzernTotal = await subtitleCount(page);
    expect(luzernTotal).toBe(await sumOfRowBadges(page));

    // Same font family, style and colour as the title, at a much smaller size.
    const type = await page.locator('kellermeister-header').evaluate((el) => {
      const read = (n: Element) => {
        const s = getComputedStyle(n);
        return { family: s.fontFamily, style: s.fontStyle, color: s.color, size: parseFloat(s.fontSize) };
      };
      return {
        h1: read(el.shadowRoot!.querySelector('h1')!),
        sub: read(el.querySelector('span[slot="subtitle"]')!),
      };
    });
    expect(type.sub.family).toBe(type.h1.family);
    expect(type.sub.style).toBe(type.h1.style);
    expect(type.sub.color).toBe(type.h1.color);
    expect(type.sub.size).toBe(16);
    expect(type.sub.size).toBeLessThan(type.h1.size);
  });

  test('shows each cellar its own total', async () => {
    await openCellar(page, 'Hütte');
    huetteTotal = await subtitleCount(page);
    expect(huetteTotal).toBe(await sumOfRowBadges(page));
    expect(huetteTotal).not.toBe(luzernTotal);
  });

  test('an active filter shows matching von total, clearing it shows the total', async () => {
    await openCellar(page, 'Luzern');
    const all = await sumOfRowBadges(page);

    for (const filter of ['Sprudel', 'Rot', 'Weiss', 'Rosé']) {
      await page.getByRole('button', { name: filter, exact: true }).click();
      await expect.poll(() => sumOfRowBadges(page)).toBeLessThan(all);
      await expect(subtitle(page)).toHaveText(filteredLabel(await sumOfRowBadges(page), luzernTotal));
      await page.getByRole('button', { name: filter, exact: true }).click();
      await expect.poll(() => sumOfRowBadges(page)).toBe(all);
      await expect(subtitle(page)).toHaveText(countLabel(luzernTotal));
    }

    // Combined filters: the matching count is whatever passes both.
    await page.getByRole('button', { name: 'Sprudel', exact: true }).click();
    await page.getByRole('button', { name: 'Rosé', exact: true }).click();
    await expect.poll(() => sumOfRowBadges(page)).toBeLessThan(all);
    await expect(subtitle(page)).toHaveText(filteredLabel(await sumOfRowBadges(page), luzernTotal));
    await page.getByRole('button', { name: 'Sprudel', exact: true }).click();
    await page.getByRole('button', { name: 'Rosé', exact: true }).click();
    await expect(subtitle(page)).toHaveText(countLabel(luzernTotal));

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.locator('.search-input').fill('Pinot');
    await expect.poll(() => sumOfRowBadges(page)).toBeLessThan(all);
    await expect(subtitle(page)).toHaveText(filteredLabel(await sumOfRowBadges(page), luzernTotal));

    // A search with no matches shows "0 von total".
    await page.locator('.search-input').fill('zzz-no-such-wine');
    await expect(page.locator('.no-bottles')).toBeVisible();
    await expect(subtitle(page)).toHaveText(filteredLabel(0, luzernTotal));

    await page.locator('.search-input').fill('');
    await expect.poll(() => sumOfRowBadges(page)).toBe(all);
    await expect(subtitle(page)).toHaveText(countLabel(luzernTotal));
    await page.keyboard.press('Escape');
  });

  // fixme: a few seconds after a full page load the app can leave the cellar
  // view for "/" on its own (likely the restorePreviousSession redirect in
  // InruptSolidService.restoreSession), and this test runs long enough to hit it.
  test.fixme('a filter restored from the URL shows matching von total on open', async () => {
    // Activate Rot (written to the URL as ?rot=1), leave for Kellerarbeit and
    // come back: the cellar view is re-entered with the filter only in its URL.
    await openCellar(page, 'Luzern');
    await page.getByRole('button', { name: 'Rot', exact: true }).click();
    await page.waitForURL(/\?rot=1$/);
    await page.getByRole('button', { name: 'Kellerarbeit', exact: true }).click();
    await page.waitForURL(/\/cellarwork\//);
    // A client-side history step fires no "load" event.
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForURL(/\/cellar\/.*\?rot=1$/);

    // "matching von total" appears once the filtered rows have loaded.
    await expect(subtitle(page)).toHaveText(/^\d+ von \d+ Flaschen?$/, { timeout: 30_000 });
    expect(await subtitleCount(page)).toBe(luzernTotal);
    await expect(subtitle(page)).toHaveText(filteredLabel(await sumOfRowBadges(page), luzernTotal));
  });

  test('a cellar\'s count matches its rows and uses the right noun', async () => {
    await openCellar(page, 'Brixen');
    brixenStart = await subtitleCount(page);
    expect(brixenStart).toBe(await sumOfRowBadges(page));
    await expect(subtitle(page)).toHaveText(countLabel(brixenStart));
  });

  test('moving one bottle into a cellar increments its count by one', async () => {
    // Move exactly one bottle Hütte -> Brixen through the umbuchen grid.
    await openCellar(page, 'Hütte');
    await page.getByRole('button', { name: 'Kellerarbeit', exact: true }).click();
    await page.waitForURL(/\/cellarwork\//);
    await expect(page.locator('.data-row input[type=radio]').first()).toBeVisible({ timeout: 30_000 });

    const destinations = await page
      .locator('.header-row .column2 kellermeister-button')
      .evaluateAll((els) => els.map((e) => e.getAttribute('text')));
    const brixenIndex = destinations.indexOf('Brixen');
    expect(brixenIndex).toBeGreaterThanOrEqual(0);

    // Radios are laid out bottle-major, so the first `destinations.length`
    // radios belong to the first bottle — select Brixen for that one only.
    await page.locator('.data-row input[type=radio]').nth(brixenIndex).check();
    await page.getByRole('button', { name: 'umbuchen', exact: true }).click();
    await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 60_000 });

    await openCellar(page, 'Brixen');
    await expect(subtitle(page)).toHaveText(countLabel(brixenStart + 1));

    // ...and the source cellar's total went down by one.
    await openCellar(page, 'Hütte');
    expect(await subtitleCount(page)).toBe(huetteTotal - 1);
  });

  test('disposing a bottle to Altglass decrements the count', async () => {
    await openCellar(page, 'Brixen');
    await expect(subtitle(page)).toHaveText(countLabel(brixenStart + 1));

    await page.locator('li .bottle-button').first().click();
    await page.locator('.rating-button').first().click();
    await page.locator('.rating-action.confirm').click();

    await expect(subtitle(page)).toHaveText(countLabel(brixenStart), { timeout: 30_000 });
  });

  test("other views' headers are unchanged", async () => {
    const headerHeight = async () => (await page.locator('kellermeister-header').boundingBox())?.height;

    await page.goto('/');
    await expect(page.locator('kellermeister-header')).toBeVisible();
    await expect(subtitle(page)).toHaveCount(0);
    const baseline = await headerHeight();

    for (const url of ['/order', '/profile', '/search']) {
      await page.goto(url);
      await expect(page.locator('kellermeister-header')).toBeVisible();
      await expect(subtitle(page)).toHaveCount(0);
      expect(await headerHeight()).toBe(baseline);
    }

    // The cellarwork work view, drilled into from a cellar.
    await openCellar(page, 'Luzern');
    expect(await headerHeight()).toBe(baseline);
    await page.getByRole('button', { name: 'Kellerarbeit', exact: true }).click();
    await page.waitForURL(/\/cellarwork\//);
    await expect(subtitle(page)).toHaveCount(0);
    expect(await headerHeight()).toBe(baseline);
  });

  test('disposing a listed bottle under a filter decrements both numbers', async () => {
    await openCellar(page, 'Luzern');
    const total = await subtitleCount(page);
    await page.getByRole('button', { name: 'Rot', exact: true }).click();
    await expect.poll(() => sumOfRowBadges(page)).toBeGreaterThan(0);
    const matching = await sumOfRowBadges(page);
    await expect(subtitle(page)).toHaveText(filteredLabel(matching, total));

    await page.locator('li .bottle-button').first().click();
    await page.locator('.rating-button').first().click();
    await page.locator('.rating-action.confirm').click();

    await expect(subtitle(page)).toHaveText(filteredLabel(matching - 1, total - 1), { timeout: 30_000 });
  });
});
