import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Listen for console events
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
  
  await page.goto('http://localhost:9003/dashboard/customers');
  
  // Wait for the page to load
  await page.waitForSelector('table');
  
  // Find the first Dropdown Menu Trigger and click it
  const triggers = await page.$$('[aria-haspopup="true"]');
  if (triggers.length > 0) {
    await triggers[0].click();
    await new Promise(r => setTimeout(r, 500)); // wait for dropdown to open
    
    // Find the "Edit" menu item. It should contain "Edit".
    const menuItems = await page.$$('[role="menuitem"]');
    for (const item of menuItems) {
      const text = await page.evaluate(el => el.textContent, item);
      if (text === 'Edit') {
        await item.click();
        break;
      }
    }
  }
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
