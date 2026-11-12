import { test, expect } from '@playwright/test';

test('booking flow click slot', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  
  await page.locator('text=Rebound Ace').first().click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);
  
  // Click Platz 1 header to select that court
  await page.locator('text=Platz 1').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step2b.png' });
  
  console.log('Platz 1 selected');
});
