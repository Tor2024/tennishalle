import { test, expect } from '@playwright/test';

test('booking flow steps 3-6', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  
  // Step 1: click hall card
  await page.locator('text=Rebound Ace').first().click();
  await page.waitForTimeout(2000);
  
  // Scroll to see slots
  await page.evaluate(() => window.scrollTo(0, 1000));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step2-scroll.png' });
  
  // Try clicking on Platz 1 card area first, then a slot
  await page.locator('text=Platz 1').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step3.png' });
  
  console.log('clicked Platz 1');
});
