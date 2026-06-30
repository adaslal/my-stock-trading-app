const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const AdmZip = require("adm-zip");

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

// ---------------------------------------------------------------------------
// Most-active-stocks-by-date: a CORS-safe proxy that downloads NSE's official
// end-of-day bhavcopy for any historical trading date, filters it down to
// normal equity (EQ-series) listings, and returns every one of them ranked
// and ready for the frontend to sort/slice (by volume, turnover value, or
// % change) without an extra round trip.
//
// NSE changed its bhavcopy file format on 8-Jul-2024 (legacy "cm*bhav.csv"
// -> new "UDiFF" file). This handles both, picking the right URL/schema
// based on the requested date -- mirrors scratch/most_active_by_date.py.
// ---------------------------------------------------------------------------

const NSE_ARCHIVE_BASE = "https://nsearchives.nseindia.com";
const UDIFF_SWITCH_MS = Date.UTC(2024, 6, 8); // months are 0-indexed: 6 = July
const NSE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function bhavcopyUrlForDate(dateMs) {
  if (dateMs < UDIFF_SWITCH_MS) {
    const d = new Date(dateMs);
    const dd = pad2(d.getUTCDate());
    const mon = MONTH_ABBR[d.getUTCMonth()];
    const yyyy = d.getUTCFullYear();
    return `${NSE_ARCHIVE_BASE}/content/historical/EQUITIES/${yyyy}/${mon}/cm${dd}${mon}${yyyy}bhav.csv.zip`;
  }
  const d = new Date(dateMs);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return `${NSE_ARCHIVE_BASE}/content/cm/BhavCopy_NSE_CM_0_0_0_${yyyy}${mm}${dd}_F_0000.csv.zip`;
}

// Minimal RFC4180-ish CSV line splitter (handles quoted fields with commas).
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx];
    });
    rows.push(row);
  }
  return rows;
}

// Pure row-extraction logic, deliberately separated from any HTTP/Express
// concerns so it can be unit-tested directly with synthetic CSV rows.
function extractStocks(rawRows, isUdiff) {
  const stocks = [];
  for (const row of rawRows) {
    let symbol, series, volume, valueLakhs, close, prevClose;
    if (isUdiff) {
      series = (row["SctySrs"] || "").trim();
      if (series !== "EQ") continue;
      symbol = (row["TckrSymb"] || "").trim();
      volume = parseInt(row["TtlTradgVol"], 10);
      valueLakhs = parseFloat(row["TtlTrfVal"]) / 100000;
      close = parseFloat(row["ClsPric"]);
      prevClose = parseFloat(row["PrvsClsgPric"]);
    } else {
      series = (row["SERIES"] || "").trim();
      if (series !== "EQ") continue;
      symbol = (row["SYMBOL"] || "").trim();
      volume = parseInt(row["TOTTRDQTY"], 10);
      valueLakhs = parseFloat(row["TOTTRDVAL"]) / 100000;
      close = parseFloat(row["CLOSE"]);
      prevClose = parseFloat(row["PREVCLOSE"]);
    }

    if (!symbol || !Number.isFinite(volume) || !Number.isFinite(close)) continue;

    const pctChg = prevClose ? ((close - prevClose) / prevClose) * 100 : 0;
    stocks.push({
      symbol,
      close: Math.round(close * 100) / 100,
      pctChg: Math.round(pctChg * 100) / 100,
      volume,
      valueLakhs: Math.round(valueLakhs * 100) / 100,
    });
  }
  return stocks;
}

// Throws an Error with a `.httpStatus` so the Express wrapper below can map
// it straight onto a response code without re-deriving the reason.
async function fetchMostActiveStocks(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const err = new Error("Pass a date as ?date=YYYY-MM-DD");
    err.httpStatus = 400;
    throw err;
  }

  const dateMs = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dateMs)) {
    const err = new Error(`Invalid date '${dateStr}'`);
    err.httpStatus = 400;
    throw err;
  }
  if (dateMs > Date.now()) {
    const err = new Error("That date is in the future -- NSE has no bhavcopy for it yet.");
    err.httpStatus = 400;
    throw err;
  }

  const isUdiff = dateMs >= UDIFF_SWITCH_MS;
  const url = bhavcopyUrlForDate(dateMs);

  logger.info(`Fetching NSE bhavcopy for ${dateStr} from ${url}`);

  const zipResp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: {
      "User-Agent": NSE_USER_AGENT,
      "Accept": "*/*",
      "Referer": "https://www.nseindia.com/all-reports",
    },
    validateStatus: () => true, // inspect status ourselves instead of throwing
  });

  if (zipResp.status === 404) {
    const err = new Error(
      `NSE has no bhavcopy for ${dateStr}. Most likely a weekend or market holiday -- try the previous trading day.`
    );
    err.httpStatus = 404;
    throw err;
  }
  if (zipResp.status !== 200) {
    const err = new Error(`NSE returned HTTP ${zipResp.status} for this date.`);
    err.httpStatus = 502;
    throw err;
  }

  let csvText;
  try {
    const zip = new AdmZip(Buffer.from(zipResp.data));
    const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".csv"));
    if (!entry) throw new Error("no .csv entry in zip");
    csvText = entry.getData().toString("utf8");
  } catch (zipErr) {
    logger.error("Bad zip from NSE:", zipErr.message);
    const err = new Error(
      "NSE responded but didn't return a valid zip file -- likely blocked/rate-limited. Try again shortly."
    );
    err.httpStatus = 502;
    throw err;
  }

  const rawRows = parseCsv(csvText);
  const stocks = extractStocks(rawRows, isUdiff);

  if (stocks.length === 0) {
    const err = new Error("Downloaded the file but found no EQ-series rows -- NSE may have changed the schema again.");
    err.httpStatus = 502;
    throw err;
  }

  logger.info(`Parsed ${stocks.length} EQ stocks for ${dateStr}`);
  return { date: dateStr, count: stocks.length, stocks };
}

exports.getMostActiveStocks = onRequest({ cors: true }, async (request, response) => {
  const dateStr = request.query.date; // expects YYYY-MM-DD (native <input type="date"> format)
  try {
    const payload = await fetchMostActiveStocks(dateStr);
    // Bhavcopies for past dates never change -- cache hard so repeat lookups
    // (and NSE itself) aren't hit on every page load.
    response.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
    return response.status(200).json(payload);
  } catch (error) {
    if (error.httpStatus) {
      return response.status(error.httpStatus).json({ error: error.message });
    }
    logger.error("Failed to fetch/parse NSE bhavcopy:", error.message);
    return response.status(500).json({
      error: "Failed to retrieve NSE bhavcopy data.",
      details: error.message,
    });
  }
});

// Exported purely for local unit testing (not used by Firebase at runtime).
exports._internal = { bhavcopyUrlForDate, parseCsv, extractStocks, fetchMostActiveStocks, UDIFF_SWITCH_MS };
