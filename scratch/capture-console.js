import puppeteer from 'puppeteer-core';

console.log('🌐 Launching headless Chrome diagnostics for: https://my-stock-trading-app.web.app');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });

  const page = await browser.newPage();

  // Listen to browser console logs
  page.on('console', msg => {
    console.log(`[Browser Console - ${msg.type()}] ${msg.text()}`);
  });

  // Listen to unhandled page exceptions
  page.on('pageerror', err => {
    console.error('\n❌ BROWSER RUNTIME CRASH DETECTED:');
    console.error(err.toString());
  });

  // Listen to network request failures (like asset 404s)
  page.on('requestfailed', req => {
    console.error(`⚠️ Network Request Failed: ${req.url()} (${req.failure()?.errorText})`);
  });

  try {
    await page.goto('https://my-stock-trading-app.web.app', { 
      waitUntil: 'networkidle2', 
      timeout: 10000 
    });
    
    console.log('📊 Page loaded. Waiting for any rendering cycle exceptions...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.error('Failed to navigate or load page:', error);
  } finally {
    await browser.close();
    console.log('🌐 Chrome session closed.');
  }
}

run().catch(console.error);
