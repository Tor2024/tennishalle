import { test, expect } from '@playwright/test';

test('booking flow click cell by coords', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  
  await page.locator('text=Rebound Ace').first().click();
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);
  
  // Click on Platz 1 first slot cell area - try coordinates
  // Platz 1 column is around x=730, first slot row around y=280
  await page.mouse.click(730, 320);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step4-coords.png' });
  
  console.log('clicked coords');
});
