export interface Candle {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  barDelta?: number; // Decoupled volume delta (simulated intrabar data)
}


export interface VolumeBin {
  price: number;
  volume: number;
  isWithinValueArea: boolean;
}

export interface PAVPResult {
  pivots: {
    highs: { index: number; price: number; time: string }[];
    lows: { index: number; price: number; time: string }[];
  };
  volumeProfile: {
    bins: VolumeBin[];
    poc: number;
    vah: number;
    val: number; // Value Area Low (distinct from lowestPrice / "P Low")
    highestPrice: number;
    lowestPrice: number;
  } | null;
  squeeze: {
    isSqueezed: boolean;
    bbUpper: number;
    bbLower: number;
    kcUpper: number;
    kcLower: number;
    basis: number;
  };
  vdu: {
    vduRatio: number;
    isVolumeDriedUp: boolean;
    volumeSma20: number;
    isVolumeSpiked: boolean; // Institutional spike detector
    isBullishAbsorption: boolean; // CVD Trapped Sellers (Upward fuchsia arrow)
    isBearishAbsorption: boolean; // CVD Trapped Buyers (Downward fuchsia arrow)
  };

  metrics: {
    sma200: number;
    sma50: number;
    ema20: number;
    isLongTermUptrend: boolean;
    isShortTermUptrend: boolean;
    setupScore: number;
    setupRating: 'A+' | 'A' | 'B' | 'C' | 'Hold';
    proximityToPLow: number; // Percentage distance to VAL
  };
}

// Helper: Calculate standard average true range (ATR)
function calculateATR(candles: Candle[], period: number = 14): number[] {
  const atrs: number[] = [];
  let trSum = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trSum += candles[0].high - candles[0].low;
      atrs.push(candles[0].high - candles[0].low);
      continue;
    }

    const h = candles[i].high;
    const l = candles[i].low;
    const prevC = candles[i - 1].close;

    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    
    if (i < period) {
      trSum += tr;
      atrs.push(trSum / (i + 1));
    } else {
      const prevAtr = atrs[i - 1];
      const atr = (prevAtr * (period - 1) + tr) / period;
      atrs.push(atr);
    }
  }

  return atrs;
}

// Main calculation engine
export function calculatePAVP(candles: Candle[], pvtLength: number = 20, numProfileLevels: number = 25, valueAreaPercent: number = 0.68, absorptionMult: number = 1.5): PAVPResult {
  const n = candles.length;
  
  // 1. Calculate Standard Moving Averages
  const closes = candles.map(c => c.close);
  const getSMA = (arr: number[], period: number): number => {
    if (arr.length < period) return arr[arr.length - 1] || 0;
    const sum = arr.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  };

  const getEMA = (arr: number[], period: number): number => {
    if (arr.length === 0) return 0;
    let val = arr[0];
    const k = 2 / (period + 1);
    for (let i = 1; i < arr.length; i++) {
      val = arr[i] * k + val * (1 - k);
    }
    return val;
  };

  const sma200 = getSMA(closes, 200);
  const sma50 = getSMA(closes, 50);
  const ema20 = getEMA(closes, 20);

  // 2. Pivot Detection (strength L = 20)
  const pivotHighs: { index: number; price: number; time: string }[] = [];
  const pivotLows: { index: number; price: number; time: string }[] = [];

  for (let i = pvtLength; i < n - pvtLength; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    let isHigh = true;
    let isLow = true;

    for (let offset = -pvtLength; offset <= pvtLength; offset++) {
      if (offset === 0) continue;
      
      if (candles[i + offset].high > currentHigh) {
        isHigh = false;
      }
      if (candles[i + offset].low < currentLow) {
        isLow = false;
      }
    }

    if (isHigh) pivotHighs.push({ index: i, price: currentHigh, time: candles[i].time });
    if (isLow) pivotLows.push({ index: i, price: currentLow, time: candles[i].time });
  }

  // 3. Volume Profile anchored from the last confirmed Pivot to latest bar
  let volumeProfile: PAVPResult['volumeProfile'] = null;
  const lastPivotIndex = pivotLows.length > 0 
    ? pivotLows[pivotLows.length - 1].index 
    : (pivotHighs.length > 0 ? pivotHighs[pivotHighs.length - 1].index : 0);

  const profileStartIndex = Math.max(0, lastPivotIndex);
  const profileEndIndex = n - 1;

  if (profileEndIndex > profileStartIndex) {
    const profileCandles = candles.slice(profileStartIndex, profileEndIndex + 1);
    let highestPrice = Math.max(...profileCandles.map(c => c.high));
    let lowestPrice = Math.min(...profileCandles.map(c => c.low));

    if (highestPrice === lowestPrice) {
      highestPrice += 0.01;
    }

    const priceStep = (highestPrice - lowestPrice) / numProfileLevels;
    const binVolumes = new Array(numProfileLevels).fill(0);

    for (let i = profileStartIndex; i <= profileEndIndex; i++) {
      const c = candles[i];
      const candleRange = Math.max(c.high - c.low, 0.0001);
      
      for (let k = 0; k < numProfileLevels; k++) {
        const binBottom = lowestPrice + k * priceStep;
        const binTop = binBottom + priceStep;
        
        if (c.high >= binBottom && c.low < binTop) {
          const overlapBottom = Math.max(c.low, binBottom);
          const overlapTop = Math.min(c.high, binTop);
          const overlapPercent = (overlapTop - overlapBottom) / candleRange;
          binVolumes[k] += c.volume * overlapPercent;
        }
      }
    }

    // Identify Point of Control (POC)
    let maxVol = -1;
    let pocLevel = 0;
    for (let k = 0; k < numProfileLevels; k++) {
      if (binVolumes[k] > maxVol) {
        maxVol = binVolumes[k];
        pocLevel = k;
      }
    }
    const pocPrice = lowestPrice + (pocLevel + 0.5) * priceStep;

    // Identify Value Area (VAH & VAL)
    const targetVolume = binVolumes.reduce((a, b) => a + b, 0) * valueAreaPercent;
    let accumulatedVolume = binVolumes[pocLevel];
    let levelAbove = pocLevel;
    let levelBelow = pocLevel;

    while (accumulatedVolume < targetVolume) {
      if (levelBelow === 0 && levelAbove === numProfileLevels - 1) {
        break;
      }

      let volAbove = 0;
      if (levelAbove < numProfileLevels - 1) {
        volAbove = binVolumes[levelAbove + 1];
      }

      let volBelow = 0;
      if (levelBelow > 0) {
        volBelow = binVolumes[levelBelow - 1];
      }

      if (volAbove === 0 && volBelow === 0) break;

      if (volAbove >= volBelow) {
        accumulatedVolume += volAbove;
        levelAbove++;
      } else {
        accumulatedVolume += volBelow;
        levelBelow--;
      }
    }

    const vah = lowestPrice + (levelAbove + 1) * priceStep;
    const val = lowestPrice + levelBelow * priceStep; // VAL = "p low"

    const bins: VolumeBin[] = binVolumes.map((vol, idx) => ({
      price: lowestPrice + (idx + 0.5) * priceStep,
      volume: vol,
      isWithinValueArea: idx >= levelBelow && idx <= levelAbove
    }));

    volumeProfile = {
      bins,
      poc: pocPrice,
      vah,
      val,
      highestPrice,
      lowestPrice
    };
  }

  // 4. Volatility Squeeze (Bollinger Bands + Keltner Channels)
  const lastClose = closes[n - 1] || 0;
  
  // Bollinger Bands
  const bbSMA = getSMA(closes, 20);
  const deviations = closes.slice(-20).map(c => Math.pow(c - bbSMA, 2));
  const stdDev = Math.sqrt(deviations.reduce((a, b) => a + b, 0) / 20);
  const bbUpper = bbSMA + 2 * stdDev;
  const bbLower = bbSMA - 2 * stdDev;

  // Keltner Channels (using standard Exponential Moving Average and ATR)
  const atrs = calculateATR(candles, 20);
  const currentAtr = atrs[n - 1] || 0;
  const kcEMA = getEMA(closes, 20);
  const kcUpper = kcEMA + 1.5 * currentAtr;
  const kcLower = kcEMA - 1.5 * currentAtr;

  const isSqueezed = bbUpper < kcUpper && bbLower > kcLower;

  // 5. Volume Dry-Up (VDU) & Volume Spikes
  const vols = candles.map(c => c.volume);
  const volumeSma20 = getSMA(vols, 20);
  const recentVols = vols.slice(-3);
  const recentVolAvg = recentVols.reduce((a, b) => a + b, 0) / Math.max(recentVols.length, 1);
  const vduRatio = volumeSma20 > 0 ? recentVolAvg / volumeSma20 : 1;
  const isVolumeDriedUp = vduRatio <= 0.55; // Under 55% of regular trading volume

  const latestVolume = vols[n - 1] || 0;
  const isVolumeSpiked = latestVolume > volumeSma20 * 1.618; // Surges above 1.618x Volume SMA!

  // Calculate price-action volume delta (single-bar proxy for order flow -- no real intrabar
  // tick data is available from daily OHLCV, so each bar's net buy/sell pressure is estimated
  // from where its close landed within its own high-low range).
  const deltas = candles.map(c => {
    if (c.barDelta !== undefined) return c.barDelta;
    const range = c.high - c.low;
    const buyPct = range > 0 ? (c.close - c.low) / range : 0.5;
    return c.volume * (2.0 * buyPct - 1.0);
  });

  // CVD Absorption (multi-day divergence). NOTE: a single bar's delta and "close vs. its own
  // midpoint" are mathematically the SAME signal (close > midpoint <=> buyPct > 0.5 <=> delta > 0),
  // so a same-bar check (delta very negative AND close > midpoint) can never be true -- confirmed
  // via backtest_explosive_signal.py returning zero real-data matches across 132k signal-days.
  // Absorption instead compares NET ORDER FLOW over a recent window against the PRICE OUTCOME
  // over that same window -- two independent quantities. A stock can see heavy net selling
  // (negative cumulative delta) over several days while price still holds flat or rises
  // (trapped sellers / absorption), or heavy net buying while price holds flat or falls
  // (trapped buyers). absorptionMult defaults to 1.5 to match reliance_scalping_composite.pine /
  // reliance_scalping_strategy.pine / scan_real_market.py -- change all together.
  const ABSORPTION_WINDOW = 5;     // trading days of order-flow + price action compared
  const ABSORPTION_BASELINE = 20;  // trading days used to normalize "how big is big" for cumDelta

  const cumDeltaSeries = deltas.map((_, i) => {
    const start = Math.max(0, i - ABSORPTION_WINDOW + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += deltas[j];
    return sum;
  });
  const absCumDeltaSeries = cumDeltaSeries.map(d => Math.abs(d));
  const avgAbsCumDelta = getSMA(absCumDeltaSeries, ABSORPTION_BASELINE);

  const latestCumDelta = cumDeltaSeries[n - 1] || 0;
  const windowStartClose = closes[Math.max(0, n - ABSORPTION_WINDOW)] ?? lastClose;
  const latestPriceRet = windowStartClose > 0 ? (lastClose / windowStartClose) - 1.0 : 0;

  // Bullish CVD Absorption: heavy net SELLING over the last few bars, but price still held
  // flat or rose over that same stretch -- sellers got absorbed instead of pushing price down.
  const isBullishAbsorption = latestCumDelta < -avgAbsCumDelta * absorptionMult && latestPriceRet >= 0;

  // Bearish CVD Absorption: heavy net BUYING over the last few bars, but price still held
  // flat or fell over that same stretch -- buyers got absorbed instead of pushing price up.
  const isBearishAbsorption = latestCumDelta > avgAbsCumDelta * absorptionMult && latestPriceRet <= 0;


  // 6. Setup Rating Calculations
  const isLongTermUptrend = lastClose > sma200 && sma50 > sma200;
  const isShortTermUptrend = lastClose > ema20;

  // Proximity to Profile Low ("p low" - lowestPrice)
  const activePLow = volumeProfile ? volumeProfile.lowestPrice : (pivotLows.length > 0 ? pivotLows[pivotLows.length - 1].price : lastClose);
  const proximityToPLow = ((lastClose - activePLow) / activePLow) * 100; // % distance

  let setupScore = 0;
  // Trend Score (Max 40 points)
  if (isLongTermUptrend) setupScore += 25;
  if (isShortTermUptrend) setupScore += 15;

  // Proximity to p low Support Score (Max 30 points)
  // Optimal pull back: current price is within +1.5% and above -0.5% of "p low"
  if (proximityToPLow >= -0.5 && proximityToPLow <= 1.5) {
    setupScore += 30;
  } else if (proximityToPLow > 1.5 && proximityToPLow <= 3.5) {
    setupScore += 20;
  } else if (proximityToPLow > 3.5 && proximityToPLow <= 6.0) {
    setupScore += 10;
  } else if (proximityToPLow >= -2.0 && proximityToPLow < -0.5) {
    setupScore += 15; // minor overshoot but close
  }

  // Volatility Squeeze Coiling (Max 15 points)
  if (isSqueezed) setupScore += 15;

  // Volume Dry-Up Supply Exhaustion (Max 15 points)
  if (isVolumeDriedUp) setupScore += 15;
  else if (vduRatio < 0.7) setupScore += 8;

  let setupRating: PAVPResult['metrics']['setupRating'] = 'Hold';
  if (setupScore >= 85) setupRating = 'A+';
  else if (setupScore >= 70) setupRating = 'A';
  else if (setupScore >= 55) setupRating = 'B';
  else if (setupScore >= 40) setupRating = 'C';

  return {
    pivots: {
      highs: pivotHighs,
      lows: pivotLows
    },
    volumeProfile,
    squeeze: {
      isSqueezed,
      bbUpper,
      bbLower,
      kcUpper,
      kcLower,
      basis: bbSMA
    },
    vdu: {
      vduRatio,
      isVolumeDriedUp,
      volumeSma20,
      isVolumeSpiked,
      isBullishAbsorption,
      isBearishAbsorption
    },

    metrics: {
      sma200,
      sma50,
      ema20,
      isLongTermUptrend,
      isShortTermUptrend,
      setupScore,
      setupRating,
      proximityToPLow
    }
  };
}
