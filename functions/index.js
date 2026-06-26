const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

// Secure CORS-Enabled proxy to fetch live daily/hourly candles for Indian stocks
exports.getIndianStockHistory = onRequest({ cors: true }, async (request, response) => {
  const ticker = request.query.ticker || "TATAMOTORS.NS";
  const interval = request.query.interval || "1d"; // '1d' or '1h'
  const range = request.query.range || "1y"; // '1y', '3mo', '6mo'

  logger.info(`Fetching candles for stock: ${ticker}, interval: ${interval}, range: ${range}`);

  try {
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    
    const yfResponse = await axios.get(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const result = yfResponse.data?.chart?.result?.[0];
    if (!result) {
      logger.error(`Stock ticker ${ticker} not found on Yahoo Finance`);
      return response.status(404).json({ error: "Stock ticker not found or no data available." });
    }

    const timestamps = result.timestamp || [];
    const indicators = result.indicators?.quote?.[0] || {};
    const { open = [], high = [], low = [], close = [], volume = [] } = indicators;

    // Convert timestamps and arrays to structured unified OHLCV candles
    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      // Filter out gaps
      if (open[i] === null || close[i] === null) continue;

      const dateObj = new Date(timestamps[i] * 1000);
      const timeString = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD

      candles.push({
        time: timeString,
        open: parseFloat(open[i].toFixed(2)),
        high: parseFloat(high[i].toFixed(2)),
        low: parseFloat(low[i].toFixed(2)),
        close: parseFloat(close[i].toFixed(2)),
        volume: parseInt(volume[i] || 0)
      });
    }

    logger.info(`Successfully parsed ${candles.length} candles for ${ticker}`);
    
    // Set caching headers to avoid redundant API hits and speed up responses
    response.set("Cache-Control", "public, max-age=300, s-maxage=600"); // cache 5-10 mins
    return response.status(200).json({
      ticker,
      name: result.meta?.shortName || ticker,
      currency: result.meta?.currency || "INR",
      candles
    });

  } catch (error) {
    logger.error("Failed to fetch historical data from Yahoo Finance:", error.message);
    return response.status(500).json({ 
      error: "Failed to retrieve stock historical data from Yahoo Finance.",
      details: error.message 
    });
  }
});
