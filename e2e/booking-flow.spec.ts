import { test, expect } from '@playwright/test';

test('booking flow steps', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step1.png' });
  
  // Step 1: click hall card (Tennishalle)
  await page.locator('text=Tennishalle').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step2.png' });
  
  console.log('Reached step 2');
});
