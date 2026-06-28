import type { Candle } from './pavpEngine';
import { calculatePAVP } from './pavpEngine';

export interface WatchlistItem {
  ticker: string;
  name: string;
  basePrice: number;
  volatility: number;
  trend: 'up' | 'flat' | 'squeeze' | 'trap' | 'explosive';
  capSize: 'large' | 'mid' | 'small';
}

export const INDIAN_WATCHLIST: WatchlistItem[] = [
  // Small Caps
  { ticker: 'RAMCOSYS.NS', name: 'Ramco Systems Limited', basePrice: 469.90, volatility: 0.038, trend: 'squeeze', capSize: 'small' },
  { ticker: 'SPARC.NS', name: 'Sun Pharma Advanced Research', basePrice: 209.80, volatility: 0.042, trend: 'up', capSize: 'small' },
  { ticker: 'GENESYS.NS', name: 'Genesys International Corporation', basePrice: 377.40, volatility: 0.036, trend: 'squeeze', capSize: 'small' },
  { ticker: 'LAXMIDNT.NS', name: 'Laxmi Dental Limited', basePrice: 249.30, volatility: 0.045, trend: 'up', capSize: 'small' },
  { ticker: 'KPIGREEN.NS', name: 'KPI Green Energy Limited', basePrice: 1850, volatility: 0.045, trend: 'explosive', capSize: 'small' },
  { ticker: 'ZENTEC.NS', name: 'Zen Technologies Limited', basePrice: 1050, volatility: 0.040, trend: 'squeeze', capSize: 'small' },

  // Mid Caps
  { ticker: 'VRLLOG.NS', name: 'VRL Logistics Limited', basePrice: 242, volatility: 0.022, trend: 'trap', capSize: 'mid' },
  { ticker: 'RVNL.NS', name: 'Rail Vikas Nigam Limited', basePrice: 380, volatility: 0.035, trend: 'up', capSize: 'mid' },
  { ticker: 'JIOFIN.NS', name: 'Jio Financial Services Limited', basePrice: 355, volatility: 0.020, trend: 'squeeze', capSize: 'mid' },
  { ticker: 'IREDA.NS', name: 'Indian Renewable Energy Dev Agency', basePrice: 185, volatility: 0.038, trend: 'up', capSize: 'mid' },
  { ticker: 'LTIM.NS', name: 'LTIMindtree Limited', basePrice: 4800, volatility: 0.018, trend: 'squeeze', capSize: 'mid' },
  { ticker: 'SUZLON.NS', name: 'Suzlon Energy Limited', basePrice: 48.50, volatility: 0.042, trend: 'explosive', capSize: 'mid' },
  { ticker: 'SJVN.NS', name: 'SJVN Limited', basePrice: 130, volatility: 0.038, trend: 'squeeze', capSize: 'mid' },
  { ticker: 'HUDCO.NS', name: 'Housing & Urban Development Corp', basePrice: 280, volatility: 0.035, trend: 'up', capSize: 'mid' },

  // Large Caps
  { ticker: 'TATAMOTORS.NS', name: 'Tata Motors Limited', basePrice: 940, volatility: 0.018, trend: 'squeeze', capSize: 'large' },
  { ticker: 'RELIANCE.NS', name: 'Reliance Industries Limited', basePrice: 2850, volatility: 0.011, trend: 'up', capSize: 'large' },
  { ticker: 'HAL.NS', name: 'Hindustan Aeronautics Limited', basePrice: 4200, volatility: 0.019, trend: 'explosive', capSize: 'large' },
  { ticker: 'BEL.NS', name: 'Bharat Electronics Limited', basePrice: 260, volatility: 0.022, trend: 'squeeze', capSize: 'large' },
  { ticker: 'ZOMATO.NS', name: 'Zomato Limited', basePrice: 195, volatility: 0.028, trend: 'up', capSize: 'large' },
  { ticker: 'SBIN.NS', name: 'State Bank of India', basePrice: 810, volatility: 0.014, trend: 'flat', capSize: 'large' },
  { ticker: 'HDFCBANK.NS', name: 'HDFC Bank Limited', basePrice: 1520, volatility: 0.012, trend: 'flat', capSize: 'large' },
  { ticker: 'TCS.NS', name: 'Tata Consultancy Services Limited', basePrice: 3850, volatility: 0.012, trend: 'flat', capSize: 'large' },
  { ticker: 'INFY.NS', name: 'Infosys Limited', basePrice: 1530, volatility: 0.015, trend: 'squeeze', capSize: 'large' },
  { ticker: 'ICICIBANK.NS', name: 'ICICI Bank Limited', basePrice: 1110, volatility: 0.013, trend: 'up', capSize: 'large' },
  { ticker: 'BHARTIARTL.NS', name: 'Bharti Airtel Limited', basePrice: 1380, volatility: 0.015, trend: 'up', capSize: 'large' },
  { ticker: 'ITC.NS', name: 'ITC Limited', basePrice: 430, volatility: 0.011, trend: 'flat', capSize: 'large' },
  { ticker: 'AXISBANK.NS', name: 'Axis Bank Limited', basePrice: 1150, volatility: 0.014, trend: 'up', capSize: 'large' },
  { ticker: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank Limited', basePrice: 1720, volatility: 0.013, trend: 'flat', capSize: 'large' },
  { ticker: 'LT.NS', name: 'Larsen & Toubro Limited', basePrice: 3450, volatility: 0.014, trend: 'up', capSize: 'large' },
  { ticker: 'TATASTEEL.NS', name: 'Tata Steel Limited', basePrice: 165, volatility: 0.022, trend: 'squeeze', capSize: 'large' },
  { ticker: 'M&M.NS', name: 'Mahindra & Mahindra Limited', basePrice: 2500, volatility: 0.018, trend: 'up', capSize: 'large' },
  { ticker: 'HINDUNILVR.NS', name: 'Hindustan Unilever Limited', basePrice: 2450, volatility: 0.010, trend: 'flat', capSize: 'large' }
];

export const NIFTY_TICKERS = [
  'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS',
  'SBIN.NS', 'BHARTIARTL.NS', 'ITC.NS', 'LTIM.NS', 'AXISBANK.NS',
  'KOTAKBANK.NS', 'LT.NS', 'TATASTEEL.NS', 'M&M.NS', 'HINDUNILVR.NS'
];



export function generateHistoricalData(item: WatchlistItem, count: number = 250): Candle[] {
  const candles: Candle[] = [];
  const now = new Date();
  
  let currentPrice = item.basePrice;
  let volumeBase = 1500000;
  
  if (item.ticker === 'VRLLOG.NS') volumeBase = 800000;
  if (item.ticker === 'RVNL.NS') volumeBase = 4000000;
  if (item.ticker === 'RAMCOSYS.NS') volumeBase = 2500000;
  if (item.ticker === 'SPARC.NS') volumeBase = 32000000;
  if (item.ticker === 'GENESYS.NS') volumeBase = 12000000;
  if (item.ticker === 'LAXMIDNT.NS') volumeBase = 3500000;

  for (let i = count - 1; i >= 0; i--) {
    const candleDate = new Date(now);
    candleDate.setDate(now.getDate() - i);
    
    // Skip weekends
    const day = candleDate.getDay();
    if (day === 0 || day === 6) continue;

    const timeString = candleDate.toISOString().split('T')[0];

    // Determine path based on trend preset
    let priceChangePercent = (Math.random() - 0.5) * item.volatility;

    // Apply macro paths
    if (item.trend === 'up') {
      // General strong uptrend: 200 SMA is far below, price rises slowly
      priceChangePercent += 0.0015; // upward bias
      
      // Add occasional minor pullbacks
      if (i > 40 && i < 60) priceChangePercent -= 0.003;
      if (i > 160 && i < 185) priceChangePercent -= 0.004;
    } else if (item.trend === 'squeeze') {
      // Period of strong uptrend, followed by an extremely narrow range (volatility squeeze)
      const isSqueezeZone = i < 25; // Squeeze is active in the last 25 candles
      
      if (!isSqueezeZone) {
        priceChangePercent += 0.0018; // strong historical uptrend
        if (i > 70 && i < 100) priceChangePercent -= 0.003; // standard pullback
      } else {
        // Tight consolidation zone (coiling energy)
        priceChangePercent = (Math.random() - 0.5) * (item.volatility * 0.35); // volatility shrinks to 35% of normal!
        // Pull down slightly onto VAL line support
        priceChangePercent -= 0.0002; 
      }
    } else if (item.trend === 'explosive') {
      // Historical strong uptrend, then tight consolidation right below the high. The final
      // 5 trading days are overwritten below (after this loop) with a scripted multi-day
      // absorption + breakout pattern -- done as a post-process over the last 5 *array*
      // entries (not raw loop index i) so it lands correctly regardless of weekend date-skips.
      if (i > 15) {
        priceChangePercent += 0.0018; // strong historical uptrend
        if (i > 70 && i < 100) priceChangePercent -= 0.003; // standard pullback
      } else {
        // Tight consolidation right below the high
        priceChangePercent = (Math.random() - 0.5) * (item.volatility * 0.3); // very tight range
        priceChangePercent -= 0.0001; // stable/consolidating
      }
    } else if (item.trend === 'trap') {
      // The VRLLOG Trap Setup: standard downtrend/consolidation into support. The final
      // 5 trading days are overwritten below (after this loop) with a scripted multi-day
      // bearish absorption + breakdown pattern -- done as a post-process over the last 5
      // *array* entries (not raw loop index i), mirroring the 'explosive' design.
      if (i > 45) {
        priceChangePercent -= 0.001; // steady decline
      } else if (i <= 45 && i > 5) {
        priceChangePercent -= 0.0035; // aggressive pullback towards p low
      }
    } else {
      // Flat range consolidation
      if (i > 100 && i < 150) priceChangePercent += 0.002;
      if (i <= 100 && i > 50) priceChangePercent -= 0.002;
    }

    // Calculate OHLC
    const open = currentPrice;
    let close = currentPrice * (1 + priceChangePercent);
    
    // Safety caps
    if (close < 5) close = 5;

    const high = Math.max(open, close) * (1 + Math.random() * (item.volatility * 0.5));
    const low = Math.min(open, close) * (1 - Math.random() * (item.volatility * 0.5));

    // Volume Calculations (VDU setup)
    let volume = volumeBase * (0.6 + Math.random() * 0.8);
    
    // If we are in the last 3 days of a squeeze, dry up volume significantly (VDU)
    if (item.trend === 'squeeze' && i < 4) {
      volume = volumeBase * (0.28 + Math.random() * 0.15); // Volume shrinks to just 35% of regular volume!
    }
    const candle: Candle = {
      time: timeString,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(volume)
    };

    candles.push(candle);

    currentPrice = close;
  }

  // Post-process: overwrite the last 5 *array* entries (real trading days, dates already
  // correctly weekend-skipped above) for the 'explosive' demo trend with a genuine multi-day
  // absorption pattern -- 4 days of heavy net selling (each day's close pinned near its own
  // low) absorbed on a gentle staircase-up in price/range, followed by a breakout candle that
  // closes inside the [VAH, Profile High] zone. This is real OHLCV shape, not a synthetic
  // barDelta override, so it satisfies pavpEngine.ts's cumulative-delta-vs-price-return
  // absorption formula (ABSORPTION_WINDOW=5) using only daily OHLCV, same as production.
  if (item.trend === 'explosive' && candles.length >= 10) {
    const cutIndex = candles.length - 5;
    const anchorPrice = candles[cutIndex - 1].close;

    // 4 days of heavy net selling absorbed: opens near the day's high, sells off hard
    // intraday, closes pinned near the day's own low (deep negative delta proxy) -- yet the
    // day's range itself ratchets gently upward day over day, so price holds instead of
    // breaking down.
    for (let t = 0; t < 4; t++) {
      const idx = cutIndex + t;
      const levelBase = anchorPrice * (1 + 0.004 * t);
      const dayHigh = levelBase * 1.010;
      const dayLow = levelBase * 0.992;
      const dayClose = dayLow + (dayHigh - dayLow) * 0.12; // bottom 12% of the day's range
      const dayOpen = dayHigh * 0.997;
      candles[idx] = {
        ...candles[idx],
        open: parseFloat(dayOpen.toFixed(2)),
        high: parseFloat(dayHigh.toFixed(2)),
        low: parseFloat(dayLow.toFixed(2)),
        close: parseFloat(dayClose.toFixed(2)),
        volume: Math.floor(volumeBase * 1.9)
      };
    }

    // The volume-profile binning (and therefore VAH / Profile High) depends only on each
    // bar's high/low/volume -- never its close. So fix this breakout bar's high/low/volume
    // first, run calculatePAVP ONCE to read the real settled VAH/Profile High including this
    // bar's contribution, then place close inside that zone with no feedback loop / guessing.
    const lastIdx = candles.length - 1;
    const preBreakoutCandles = candles.slice(0, cutIndex + 4);
    const histHigh = Math.max(...preBreakoutCandles.map(c => c.high));
    // Set slightly *above* the prior peak so this breakout bar deterministically becomes the
    // new Profile High itself -- VAH is always <= Profile High by construction, so anchoring
    // highestPrice to this bar's own high guarantees there is always room to place a valid
    // close between VAH and Profile High (no risk of VAH landing above a conservative cap).
    const breakoutHigh = histHigh * 1.001;
    const breakoutLow = histHigh * 0.94;   // long tail below (sellers absorbed)
    const breakoutVolume = Math.floor(volumeBase * (0.6 + Math.random() * 0.8));

    candles[lastIdx] = {
      ...candles[lastIdx],
      open: parseFloat((breakoutHigh * 0.99).toFixed(2)),
      high: parseFloat(breakoutHigh.toFixed(2)),
      low: parseFloat(breakoutLow.toFixed(2)),
      close: parseFloat(((breakoutHigh + breakoutLow) / 2).toFixed(2)), // placeholder, set below
      volume: breakoutVolume
    };

    const settled = calculatePAVP(candles);
    const svp = settled.volumeProfile;
    const targetHighestPrice = svp ? svp.highestPrice : breakoutHigh;
    const targetVah = svp ? svp.vah : breakoutHigh * 0.97;

    let breakoutClose = targetVah + (targetHighestPrice - targetVah) * 0.5;
    // Also floor it just above the absorption window's starting close (candles[cutIndex]) so
    // the 5-day price return used by the absorption formula stays non-negative regardless of
    // where VAH/Profile High land -- the whole point of the pattern is price holding/rising
    // despite the heavy selling earlier in the window.
    const windowStartClose = candles[cutIndex].close;
    breakoutClose = Math.max(breakoutClose, windowStartClose * 1.001);
    // Upper bound is this bar's own high (a valid candle can close at its own high), not a
    // shrunk fraction of it -- VAH sometimes lands exactly at Profile High (a fully one-sided
    // value area), and shrinking the cap would push close back below VAH in that case.
    breakoutClose = Math.min(Math.max(breakoutClose, breakoutLow * 1.01), breakoutHigh);
    candles[lastIdx].close = parseFloat(breakoutClose.toFixed(2));
  }

  // Post-process: overwrite the last 5 *array* entries for the 'trap' demo trend with a
  // genuine multi-day bearish absorption pattern -- 4 days of heavy net buying (each day's
  // close pinned near its own high) absorbed on a gentle staircase-down in price/level,
  // followed by a breakdown candle that closes inside the [Profile Low, VAL] zone. Mirrors
  // the 'explosive' design exactly, flipped: buyers keep defending a failing level, then
  // sellers finally overwhelm them (the actual "trap").
  if (item.trend === 'trap' && candles.length >= 10) {
    const cutIndex = candles.length - 5;
    const anchorPrice = candles[cutIndex - 1].close;

    // 4 days of heavy net buying absorbed: opens near the day's low, rallies hard intraday,
    // closes pinned near the day's own high (deep positive delta proxy) -- yet the day's
    // level itself ratchets gently downward day over day, so price keeps grinding lower
    // despite the buying (trapped buyers defending a failing level).
    for (let t = 0; t < 4; t++) {
      const idx = cutIndex + t;
      const levelBase = anchorPrice * (1 - 0.004 * t);
      const dayLow = levelBase * 0.990;
      const dayHigh = levelBase * 1.008;
      const dayClose = dayHigh - (dayHigh - dayLow) * 0.12; // top 12% of the day's range
      const dayOpen = dayLow * 1.003;
      candles[idx] = {
        ...candles[idx],
        open: parseFloat(dayOpen.toFixed(2)),
        high: parseFloat(dayHigh.toFixed(2)),
        low: parseFloat(dayLow.toFixed(2)),
        close: parseFloat(dayClose.toFixed(2)),
        volume: Math.floor(volumeBase * 1.9)
      };
    }

    // The volume-profile binning (and therefore VAL / Profile Low) depends only on each
    // bar's high/low/volume -- never its close. So fix this breakdown bar's high/low/volume
    // first, run calculatePAVP ONCE to read the real settled VAL/Profile Low including this
    // bar's contribution, then place close inside that zone with no feedback loop / guessing.
    const lastIdx2 = candles.length - 1;
    const preBreakdownCandles = candles.slice(0, cutIndex + 4);
    const histLow = Math.min(...preBreakdownCandles.map(c => c.low));
    // Set slightly *below* the prior trough so this breakdown bar deterministically becomes
    // the new Profile Low itself -- VAL is always >= Profile Low by construction, so
    // anchoring lowestPrice to this bar's own low guarantees there is always room to place a
    // valid close between Profile Low and VAL.
    const breakdownLow = histLow * 0.999;
    const breakdownHigh = histLow * 1.06; // long tail above (buyers absorbed)
    const breakdownVolume = Math.floor(volumeBase * (0.6 + Math.random() * 0.8) * 1.3);

    candles[lastIdx2] = {
      ...candles[lastIdx2],
      open: parseFloat((breakdownLow * 1.01).toFixed(2)),
      high: parseFloat(breakdownHigh.toFixed(2)),
      low: parseFloat(breakdownLow.toFixed(2)),
      close: parseFloat(((breakdownHigh + breakdownLow) / 2).toFixed(2)), // placeholder, set below
      volume: breakdownVolume
    };

    const settled2 = calculatePAVP(candles);
    const svp2 = settled2.volumeProfile;
    const targetLowestPrice = svp2 ? svp2.lowestPrice : breakdownLow;
    const targetVal = svp2 ? svp2.val : breakdownLow * 1.03;

    let breakdownClose = targetLowestPrice + (targetVal - targetLowestPrice) * 0.5;
    // Also cap it just below the absorption window's starting close (candles[cutIndex]) so
    // the 5-day price return used by the absorption formula stays non-positive regardless of
    // where VAL/Profile Low land -- the whole point of the pattern is price holding/falling
    // despite the heavy buying earlier in the window.
    const windowStartClose2 = candles[cutIndex].close;
    breakdownClose = Math.min(breakdownClose, windowStartClose2 * 0.999);
    // Bound is this bar's own [low, high] -- no asymmetric shrink, since VAL sometimes lands
    // exactly at Profile Low (a fully one-sided value area) and shrinking would push close
    // back above VAL in that case.
    breakdownClose = Math.max(Math.min(breakdownClose, breakdownHigh), breakdownLow);
    candles[lastIdx2].close = parseFloat(breakdownClose.toFixed(2));
  }

  return candles;
}
