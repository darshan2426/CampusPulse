
import { test, expect } from '@playwright/test';

test.describe('CampusPulse Application', () => {

  test('should open the application successfully', async ({ page }) => {
    const response = await page.goto('/');

    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    await expect(page.locator('body')).toBeVisible();
  });

  test('should load the application without a blank page', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('body')).not.toBeEmpty();
  });

});
