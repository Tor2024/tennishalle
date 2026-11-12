import { test, expect } from '@playwright/test';

test('booking flow click hall card', async ({ page }) => {
  await page.goto('https://tennishalle.vercel.app/book');
  await page.waitForTimeout(2000);
  
  // Click on the hall card - try clicking on the card area with 'Rebound Ace'
  await page.locator('text=Rebound Ace').first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:\\Users\\1977\\AppData\\Local\\Temp\\opencode\\book-step2-clicked.png' });
  
  console.log('clicked Rebound Ace card');
});
