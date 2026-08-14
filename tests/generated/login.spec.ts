import { test, expect } from '@playwright/test';

test('recorded login flow', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/');
  await page.getByTestId('email').fill('qa@example.test');
  await page.getByTestId('workspace').fill('quality-lab');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
});
