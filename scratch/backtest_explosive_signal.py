"""
Backtest: does your ACTUAL production signal (PAVP zone + CVD absorption --
isExplosiveSetup / isCollapseSetup, exactly as implemented in pavpEngine.ts /
App.tsx / scan_real_market.py) have real positive expectancy?

This answers the question directly: "if my system flags a setup today, how
often does it actually reach +5% (long) / -5% (short) before invalidating,
and is that better than just being in the zone with no CVD confirmation?"

Methodology (walk-forward, no lookahead):
  - For every ticker, every trading day, recompute the PAVP profile (pivot
    anchor, POC/VAH/VAL/P-High/P-Low) using ONLY data available up to and
    including that day -- this mirrors exactly what the live app would have
    shown you on that date, nothing from the future leaks in.
  - "Zone only" (baseline) = price closes inside VAH->P High (long) or
    P Low->VAL (short), no CVD requirement.
  - "Zone + CVD" (your actual signal) = the same zone condition AND the
    same multi-day absorption/CVD trap condition pavpEngine.ts uses (cumulative
    delta over a trailing ABSORPTION_WINDOW-day window vs. price return over
    that same window, normalized by the ABSORPTION_BASELINE-day average --
    see pavpEngine.ts for the full rationale on why this replaced the old
    same-bar delta-vs-midpoint check, which was mathematically tautological).
  - For every flagged day, simulate forward: did price hit the +5%/-5%
    target before falling back through the zone's own boundary (VAH for
    longs, VAL for shorts -- i.e. the level that would invalidate the
    thesis), within a 20-trading-day (~4 week) hold? Or did neither happen
    (timeout)?
  - Compare the two groups' win rate, loss rate, and expectancy (average
    realized return per signal, including timeouts at their actual
    mark-to-close return).

Run locally (same as scan_real_market.py / backtest_weekly_volume.py):
    python3 scratch/backtest_explosive_signal.py

This will take a while (walk-forward profile recompute per ticker per day) --
expect several minutes for the full Nifty 500 universe. Progress prints per
ticker. Full per-signal results saved to
scratch/backtest_explosive_signal_results.csv.
"""

import os
import csv
import io
import urllib.request
import numpy as np
import pandas as pd
import yfinance as yf

PERIOD = "3y"
PVT_LENGTH = 20            # pivot confirmation strength, matches pavpEngine.ts
NUM_PROFILE_LEVELS = 25
VALUE_AREA_PCT = 0.68
ABSORPTION_MULT = 1.5      # matches pavpEngine.ts / scan_real_market.py / Pine scripts
ABSORPTION_WINDOW = 5      # trading days of order-flow + price action compared
ABSORPTION_BASELINE = 20   # trading days used to normalize "how big is big" for cumDelta
MIN_HISTORY = 60           # don't evaluate signals until we have this much history

TARGET_PCT = 5.0           # the profit target we're testing for
MAX_HOLD_DAYS = 20         # ~4 trading weeks to reach it before calling it a timeout


def get_ticker_universe():
    print("Fetching Nifty 500 stock list from NSE...")
    url = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            csv_data = response.read().decode('utf-8')
            reader = csv.DictReader(io.StringIO(csv_data))
            tickers = [row['Symbol'].strip() + ".NS" for row in reader if row.get('Symbol')]
            print(f"Loaded {len(tickers)} symbols from NSE.")
            return tickers
    except Exception as e:
        print(f"Couldn't reach NSE ({e}). Using fixed fallback list.")
        return [
            "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
            "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "LT.NS", "M&M.NS",
            "HAL.NS", "ZOMATO.NS", "KOTAKBANK.NS", "AXISBANK.NS", "BAJFINANCE.NS",
            "TATAMOTORS.NS", "WIPRO.NS", "SUNPHARMA.NS", "TITAN.NS", "ULTRACEMCO.NS",
            "ASIANPAINT.NS", "NTPC.NS", "ONGC.NS", "COALINDIA.NS", "JSWSTEEL.NS",
            "TATASTEEL.NS", "HINDALCO.NS", "FEDERALBNK.NS", "PNB.NS", "IOC.NS",
            "SUZLON.NS", "RVNL.NS", "JIOFIN.NS", "IREDA.NS", "KPIGREEN.NS",
        ]


def compute_pivots(high: np.ndarray, low: np.ndarray, length: int):
    """Vectorized version of pavpEngine.ts pivot detection: bar i is a pivot
    high/low if no bar within +/- length has a higher high / lower low."""
    h = pd.Series(high)
    l = pd.Series(low)
    win = 2 * length + 1
    roll_max = h.rolling(win, center=True, min_periods=win).max()
    roll_min = l.rolling(win, center=True, min_periods=win).min()
    is_pivot_high = (h >= roll_max) & roll_max.notna()
    is_pivot_low = (l <= roll_min) & roll_min.notna()
    return np.where(is_pivot_high.to_numpy())[0], np.where(is_pivot_low.to_numpy())[0]


def bin_volume_profile(h_win, l_win, v_win, lowest, highest, num_bins=NUM_PROFILE_LEVELS):
    price_step = (highest - lowest) / num_bins
    candle_range = np.maximum(h_win - l_win, 0.0001)
    bin_volumes = np.zeros(num_bins)
    for k in range(num_bins):
        bin_bottom = lowest + k * price_step
        bin_top = bin_bottom + price_step
        mask = (h_win >= bin_bottom) & (l_win < bin_top)
        overlap_bottom = np.maximum(l_win, bin_bottom)
        overlap_top = np.minimum(h_win, bin_top)
        overlap_pct = np.where(mask, (overlap_top - overlap_bottom) / candle_range, 0.0)
        bin_volumes[k] = np.sum(v_win * overlap_pct)
    return bin_volumes, price_step


def value_area(bin_volumes, lowest, price_step, target_pct=VALUE_AREA_PCT):
    num_bins = len(bin_volumes)
    poc_level = int(np.argmax(bin_volumes))
    total = bin_volumes.sum()
    target_volume = total * target_pct
    accumulated = bin_volumes[poc_level]
    level_above = poc_level
    level_below = poc_level
    while accumulated < target_volume:
        if level_below == 0 and level_above == num_bins - 1:
            break
        vol_above = bin_volumes[level_above + 1] if level_above < num_bins - 1 else 0
        vol_below = bin_volumes[level_below - 1] if level_below > 0 else 0
        if vol_above == 0 and vol_below == 0:
            break
        if vol_above >= vol_below:
            accumulated += vol_above
            level_above += 1
        else:
            accumulated += vol_below
            level_below -= 1
    vah = lowest + (level_above + 1) * price_step
    val = lowest + level_below * price_step
    return vah, val


def simulate_outcome(direction, entry, target_price, invalidation_price, future_high, future_low, future_close):
    """direction: 'long' or 'short'. Returns (outcome, days, realized_return_pct)."""
    n = len(future_high)
    for j in range(n):
        if direction == 'long':
            stop_hit = future_low[j] <= invalidation_price
            target_hit = future_high[j] >= target_price
        else:
            stop_hit = future_high[j] >= invalidation_price
            target_hit = future_low[j] <= target_price
        # Conservative: if both trigger same bar, count as the loss (stop).
        # Sign convention throughout: positive realized% = profit on the position,
        # regardless of long/short.
        if stop_hit:
            loss_pct = (invalidation_price / entry - 1.0) * 100 if direction == 'long' else (entry - invalidation_price) / entry * 100
            return 'loss', j + 1, loss_pct
        if target_hit:
            # Hitting the target is by definition a +TARGET_PCT gain on the
            # position for EITHER direction (a short that falls 5% is a +5%
            # win, not a -5% one).
            return 'win', j + 1, TARGET_PCT
    final_ret = (future_close[-1] / entry - 1.0) * 100 if direction == 'long' else (entry - future_close[-1]) / entry * 100
    return 'timeout', n, final_ret


def analyze_ticker(ticker, daily):
    daily = daily.dropna(subset=['Close'])
    n = len(daily)
    if n < MIN_HISTORY + MAX_HOLD_DAYS + PVT_LENGTH:
        return []

    high = daily['High'].to_numpy()
    low = daily['Low'].to_numpy()
    close = daily['Close'].to_numpy()
    vol = daily['Volume'].to_numpy()

    # Daily delta proxy (no real intrabar tick data from daily OHLCV -- net buy/sell
    # pressure estimated from where close landed within its own high-low range), same
    # as pavpEngine.ts's `deltas`.
    rng = np.maximum(high - low, 1e-6)
    buy_pct = (close - low) / rng
    delta = vol * (2.0 * buy_pct - 1.0)

    # CVD Absorption (multi-day divergence), matching pavpEngine.ts exactly: a single bar's
    # delta and "close vs. its own midpoint" are mathematically the SAME signal, so the old
    # same-bar check here never found a real match (0 results across 132k signal-days --
    # the reason this redesign happened). Absorption instead compares NET ORDER FLOW over a
    # trailing ABSORPTION_WINDOW-day window against the PRICE OUTCOME over that same window,
    # normalized by the ABSORPTION_BASELINE-day average absolute cumulative delta. All of
    # this is vectorizable up front with no future leakage: cum_delta[t] only looks back from
    # t, and avg_abs_cum_delta[t] is a trailing rolling mean ending at t.
    cum_delta = pd.Series(delta).rolling(ABSORPTION_WINDOW, min_periods=1).sum().to_numpy()
    abs_cum_delta = np.abs(cum_delta)
    avg_abs_cum_delta = pd.Series(abs_cum_delta).rolling(ABSORPTION_BASELINE, min_periods=1).mean().to_numpy()

    # Price return over that same trailing window: close[t] vs. close[t - (WINDOW-1)],
    # clamped to index 0 at the start of history -- mirrors pavpEngine.ts's
    # `closes[Math.max(0, n - ABSORPTION_WINDOW)]`.
    idx_arr = np.arange(n)
    window_start_idx = np.maximum(0, idx_arr - (ABSORPTION_WINDOW - 1))
    window_start_close = close[window_start_idx]
    price_ret = np.where(window_start_close > 0, close / window_start_close - 1.0, 0.0)

    pivot_high_idx, pivot_low_idx = compute_pivots(high, low, PVT_LENGTH)

    records = []
    for t in range(MIN_HISTORY, n - MAX_HOLD_DAYS):
        confirmable_cutoff = t - PVT_LENGTH
        if confirmable_cutoff < 0:
            continue

        # Last confirmed pivot low (priority) else pivot high, as of day t.
        plo = pivot_low_idx[pivot_low_idx <= confirmable_cutoff]
        phi = pivot_high_idx[pivot_high_idx <= confirmable_cutoff]
        if len(plo) > 0:
            anchor = plo[-1]
        elif len(phi) > 0:
            anchor = phi[-1]
        else:
            continue

        if t <= anchor:
            continue

        h_win = high[anchor:t + 1]
        l_win = low[anchor:t + 1]
        v_win = vol[anchor:t + 1]
        highest = h_win.max()
        lowest = l_win.min()
        if highest == lowest:
            highest += 0.01

        bin_volumes, price_step = bin_volume_profile(h_win, l_win, v_win, lowest, highest)
        if bin_volumes.sum() <= 0:
            continue
        vah, val = value_area(bin_volumes, lowest, price_step)

        c = close[t]
        d = cum_delta[t]
        aad = avg_abs_cum_delta[t]
        pr = price_ret[t]

        in_long_zone = vah <= c <= highest
        in_short_zone = lowest <= c <= val

        # Bullish: heavy net SELLING over the last few days, but price still held flat or
        # rose over that stretch -- sellers got absorbed instead of pushing price down.
        bullish_absorption = d < -aad * ABSORPTION_MULT and pr >= 0
        # Bearish: heavy net BUYING over the last few days, but price still held flat or
        # fell over that stretch -- buyers got absorbed instead of pushing price up.
        bearish_absorption = d > aad * ABSORPTION_MULT and pr <= 0

        future_high = high[t + 1:t + 1 + MAX_HOLD_DAYS]
        future_low = low[t + 1:t + 1 + MAX_HOLD_DAYS]
        future_close = close[t + 1:t + 1 + MAX_HOLD_DAYS]

        if in_long_zone:
            target_price = c * (1 + TARGET_PCT / 100.0)
            outcome, days, realized = simulate_outcome('long', c, target_price, vah, future_high, future_low, future_close)
            records.append({
                'Ticker': ticker, 'Date': daily.index[t], 'Direction': 'long',
                'HasCVD': bool(bullish_absorption), 'Outcome': outcome, 'Days': days, 'RealizedPct': realized,
            })
        if in_short_zone:
            target_price = c * (1 - TARGET_PCT / 100.0)
            outcome, days, realized = simulate_outcome('short', c, target_price, val, future_high, future_low, future_close)
            records.append({
                'Ticker': ticker, 'Date': daily.index[t], 'Direction': 'short',
                'HasCVD': bool(bearish_absorption), 'Outcome': outcome, 'Days': days, 'RealizedPct': realized,
            })

    return records


def summarize(df: pd.DataFrame, label: str):
    n = len(df)
    if n == 0:
        print(f"  {label}: no observations")
        return
    win_pct = (df['Outcome'] == 'win').mean() * 100
    loss_pct = (df['Outcome'] == 'loss').mean() * 100
    timeout_pct = (df['Outcome'] == 'timeout').mean() * 100
    expectancy = df['RealizedPct'].mean()
    avg_days_win = df.loc[df['Outcome'] == 'win', 'Days'].mean()
    avg_days_loss = df.loc[df['Outcome'] == 'loss', 'Days'].mean()
    print(f"  {label}: n={n}")
    print(f"    win={win_pct:5.1f}%  loss={loss_pct:5.1f}%  timeout={timeout_pct:5.1f}%  "
          f"expectancy/trade={expectancy:+.2f}%  avg days to win={avg_days_win:.1f}  avg days to loss={avg_days_loss:.1f}")


def main():
    tickers = get_ticker_universe()
    print(f"Downloading {PERIOD} of daily data for {len(tickers)} symbols...")
    raw = yf.download(tickers, period=PERIOD, interval="1d", group_by="ticker", progress=True, threads=True)

    all_records = []
    for i, ticker in enumerate(tickers):
        try:
            if ticker not in raw.columns.get_level_values(0):
                continue
            daily = raw[ticker].dropna(subset=['Close'])
            if len(daily) < 100:
                continue
            recs = analyze_ticker(ticker, daily)
            all_records.extend(recs)
            if (i + 1) % 25 == 0:
                print(f"  processed {i+1}/{len(tickers)} tickers, {len(all_records)} signal-days so far...")
        except Exception as e:
            print(f"  skip {ticker}: {e}")
            continue

    if not all_records:
        print("No usable data -- check network/yfinance access.")
        return

    df = pd.DataFrame(all_records)
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backtest_explosive_signal_results.csv')
    df.to_csv(out_path, index=False)
    print(f"\nSaved {len(df)} signal-day observations to {out_path}\n")

    for direction, label in [('long', 'LONG (Explosive: VAH -> P High)'), ('short', 'SHORT (Breakdown: P Low -> VAL)')]:
        sub = df[df['Direction'] == direction]
        print("=" * 78)
        print(label)
        print("=" * 78)
        summarize(sub[~sub['HasCVD']], "Zone only, no CVD confirm (baseline)")
        summarize(sub[sub['HasCVD']], "Zone + CVD absorption (your actual production signal)")
        print()

    print("Read this as: does 'Zone + CVD' have a meaningfully higher win% and higher")
    print("expectancy/trade than 'Zone only'? If yes, the CVD confirmation is doing real")
    print(f"work. Also check the absolute expectancy number against your real costs --")
    print(f"a target of {TARGET_PCT}% needs to be cleared by enough margin to survive")
    print("slippage, brokerage, and the stop side actually getting hit at the modeled price.")


if __name__ == '__main__':
    main()
