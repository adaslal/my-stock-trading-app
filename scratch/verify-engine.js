// Import core modules natively in Node
const { calculatePAVP } = require('../src/pavpEngine.ts');
const { generateHistoricalData, INDIAN_WATCHLIST } = require('../src/mockData.ts');

console.log('🧪 Running Aegis PAVP Calculations Node Diagnostics...');

try {
  let successCount = 0;
  
  INDIAN_WATCHLIST.forEach(item => {
    console.log(`Scanning ticker: ${item.ticker}...`);
    
    // 1. Generate Candles
    const candles = generateHistoricalData(item, 250);
    if (!candles || candles.length === 0) {
      throw new Error(`Failed to generate candles for ${item.ticker}`);
    }
    
    // 2. Run PAVP calculations
    const result = calculatePAVP(candles, 20, 25, 0.68);
    
    // 3. Verify core properties
    if (!result.pivots || !result.metrics) {
      throw new Error(`Invalid calculation result structure for ${item.ticker}`);
    }
    
    console.log(`   ✅ Success! Score: ${result.metrics.setupScore}, Rating: ${result.metrics.setupRating}`);
    successCount++;
  });
  
  console.log(`\n🎉 Diagnostics complete! successfully scanned ${successCount}/${INDIAN_WATCHLIST.length} tickers with zero mathematical crashes.`);

} catch (err) {
  console.error('\n❌ DIAGNOSTICS FAILURE - Runtime crash detected:');
  console.error(err);
  process.exit(1);
}
