import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';

/**
 * The rating dialog on the cellar page is titled with the product name and
 * offers a pencil to adjust the number of bottles of that product in the cellar.
 */
const PRODUCT = 'Alois Lageder Chardonnay 2020';

const subtitleCount = async (page: Page): Promise<number> => {
  const text = (await page.locator('kellermeister-header span[slot="subtitle"]').textContent()) ?? '';
  return Number(text.trim().split(/\s+/)[0]);
};

const row = (page: Page) =>
  page.locator('li').filter({ has: page.locator('bottle-component .product-name', { hasText: PRODUCT }) }).first();

async function openHuette(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Hütte' }).click();
  await page.waitForURL(/\/cellar\//);
  await expect(row(page).locator('.bottle-button')).toBeVisible({ timeout: 30_000 });
}

test.describe('Add bottles from the rating dialog', () => {
  test('title/subtitle, the pencil opens the count dialog, and "Aktualisieren" adds and removes bottles', async ({
    authedPage: page,
  }) => {
    await openHuette(page);
    const before = Number(await row(page).locator('.bottle-button').textContent());
    const headerBefore = await subtitleCount(page);
    console.log('before:', before, '| header:', headerBefore);

    // Rating dialog: product name as title, "Bewertung" as subtitle, below it.
    await row(page).locator('.bottle-button').click();
    const title = page.locator('.rating-product');
    const subtitle = page.locator('.rating-title');
    await expect(title).toHaveText(PRODUCT);
    await expect(subtitle).toHaveText('Bewertung');
    expect((await title.boundingBox())!.y).toBeLessThan((await subtitle.boundingBox())!.y);

    // The pencil replaces the rating dialog with the count dialog, prefilled with the row count.
    await page.getByRole('button', { name: 'Anzahl anpassen' }).click();
    await expect(page.locator('.rating-button')).toHaveCount(0);
    await expect(page.locator('.count-container .rating-product')).toHaveText(PRODUCT);
    const input = page.getByLabel('Anzahl Flaschen');
    await expect(input).toHaveValue(String(before));

    // Same value → "Aktualisieren" disabled; a lower value is allowed and warns.
    const update = page.getByRole('button', { name: 'Aktualisieren' });
    await expect(update).toBeDisabled();
    await expect(page.locator('.count-hint')).toHaveCount(0);
    await input.fill(String(before - 1));
    await expect(update).toBeEnabled();
    await expect(page.locator('.count-hint')).toHaveText('1 Flasche wird gelöscht (nicht ins Altglass).');
    await input.fill('-1');
    await expect(update).toBeDisabled();

    // "Abbrechen" closes both dialogs, back to the cellar, without adding anything.
    await input.fill(String(before + 5));
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.locator('.rating-overlay')).toHaveCount(0);
    await expect(row(page).locator('.bottle-button')).toHaveText(String(before));

    // Increase by 2 and accept.
    await row(page).locator('.bottle-button').click();
    await page.getByRole('button', { name: 'Anzahl anpassen' }).click();
    await input.fill(String(before + 2));
    await expect(update).toBeEnabled();
    await update.click();

    await expect(page.locator('.count-container')).toHaveCount(0);
    await expect(row(page).locator('.bottle-button')).toHaveText(String(before + 2));
    await expect.poll(() => subtitleCount(page)).toBe(headerBefore + 2);

    // Persisted: survives a full reload.
    await page.waitForTimeout(800);
    await page.reload();
    await openHuette(page);
    await expect(row(page).locator('.bottle-button')).toHaveText(String(before + 2));

    // Lower by 2 again: the added bottles are deleted, back to the original count.
    await row(page).locator('.bottle-button').click();
    await page.getByRole('button', { name: 'Anzahl anpassen' }).click();
    await input.fill(String(before));
    await update.click();
    await expect(row(page).locator('.bottle-button')).toHaveText(String(before));
    await expect.poll(() => subtitleCount(page)).toBe(headerBefore);
  });
});
