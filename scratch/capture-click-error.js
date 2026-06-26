import puppeteer from 'puppeteer-core';

console.log('🌐 Launching Chrome diagnostics to capture JIOFIN click error...');

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });

  const page = await browser.newPage();

  // Listen to unhandled page exceptions
  page.on('pageerror', err => {
    console.error('\n❌ CLICK TRANSITION CRASH DETECTED:');
    console.error(err.toString());
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text()}`);
    }
  });

  try {
    await page.goto('https://my-stock-trading-app.web.app', { 
      waitUntil: 'networkidle2', 
      timeout: 10000 
    });
    
    console.log('📊 Page loaded. Finding JIOFIN tile and clicking...');
    
    // Simulate user clicking on Jio Financial card
    const clickSuccess = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.glass-panel'));
      const jioCard = cards.find(c => c.textContent.includes('JIOFIN'));
      if (jioCard) {
        jioCard.click();
        return true;
      }
      return false;
    });

    if (clickSuccess) {
      console.log('👆 JIOFIN tile clicked! Waiting for render errors...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      console.error('❌ Could not locate JIOFIN tile on page.');
    }
    
  } catch (error) {
    console.error('Navigation or test error:', error);
  } finally {
    await browser.close();
    console.log('🌐 Chrome session closed.');
  }
}

run().catch(console.error);
