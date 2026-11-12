import { test, expect } from '@playwright/test';

test('booking flow click slot cell', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  
  await page.locator('text=Rebound Ace').first().click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);
  
  // Click directly on a slot cell under Platz 1 - first time slot row
  // Try clicking the price cell under Platz 1 for first slot
  await page.locator('text=8,00€').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step4.png' });
  
  console.log('clicked slot price cell');
});
