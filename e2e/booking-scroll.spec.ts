import { test, expect } from '@playwright/test';

test('booking flow step 1 scroll', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step1-full.png' });
  
  // Scroll down to see if there are hall cards below
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step1-scrolled.png' });
  
  console.log('scrolled, checking for clickable elements');
});
