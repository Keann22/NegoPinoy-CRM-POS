const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto('https://nego-pinoy-crm-pos.vercel.app/dashboard/orders', { waitUntil: 'networkidle0' });

  await browser.close();
})();
