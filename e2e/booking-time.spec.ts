import { test, expect } from '@playwright/test';

test('booking flow click time cell', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  
  await page.locator('text=Rebound Ace').first().click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-slot-full.png', fullPage: true });
  
  // Click on the time range cell itself under Platz 1
  await page.locator('text=06:00–06:30').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step4.png' });
  
  console.log('clicked time cell');
});
