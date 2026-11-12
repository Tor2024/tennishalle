import { test, expect } from '@playwright/test';

test('booking flow click Platz 1 cell', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  
  await page.locator('text=Rebound Ace').first().click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);
  
  // Try clicking on Platz 1 image/card at top
  await page.locator('text=Platz 1').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-p1.png' });
  
  console.log('clicked Platz 1 label');
});
