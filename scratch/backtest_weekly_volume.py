"""
Backtest: does a week-over-week jump in average daily volume predict an
explosive price move in the weeks that follow?

This is testing the hypothesis from the Groww "1W avg vol diff" column:
"if weekly average volume was high, it was just a matter of time before
the stock rose explosively."

IMPORTANT METHODOLOGY NOTE:
The Groww screenshot that inspired this can't validate the hypothesis on its
own, because it was already filtered to stocks with >1% price change that
day -- i.e. the move had already happened. That's survivorship bias: you're
looking at confirmed winners/losers, not candidates.

This script avoids that bias by:
  1. Flagging weeks based on volume alone (no price-move filter).
  2. Requiring price to still be INSIDE its recent 12-week range (not already
     breaking out) at the time of the volume flag -- this isolates "quiet
     accumulation" from "volume spike during the move itself."
  3. Measuring what happens AFTER the flagged week (forward returns), not
     during it.

It also checks DIRECTION separately from MAGNITUDE, because volume buildup
is generally a volatility precursor (a move is coming), not a directional
one (which way is a separate question your CVD/absorption logic already
tries to answer).

Run this on your own machine (where yfinance already works, same as
scan_real_market.py):
    python3 scratch/backtest_weekly_volume.py

Outputs:
  - A printed summary table (flagged weeks vs. baseline, per threshold)
  - scratch/backtest_weekly_volume_results.csv (every weekly observation, for your own inspection)
"""

import os
import urllib.request
import csv
import io
import numpy as np
import pandas as pd
import yfinance as yf

# Lookback window for the historical data pull
PERIOD = "3y"

# How many trailing weeks define the "recent range" used to check that price
# hasn't already broken out before we flag the volume jump.
RANGE_LOOKBACK_WEEKS = 12

# How far inside the trailing high/low a week's close must sit to count as
# "still inside the range" (i.e. not already breaking out).
RANGE_BUFFER_PCT = 0.03  # 3%

# Volume week-over-week % increase thresholds to test.
VOLUME_THRESHOLDS = [50, 100, 200]

# "Explosive move" definition for the magnitude test: forward 4-week
# absolute return bigger than this counts as explosive, regardless of direction.
EXPLOSIVE_MOVE_PCT = 5.0

# Forward horizons to measure, in weeks.
FORWARD_HORIZONS = [1, 2, 4]


def get_ticker_universe():
    """Same source as scan_real_market.py: Nifty 500 list from NSE archives,
    falling back to a fixed list of liquid names across cap sizes if that's
    unreachable."""
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


def build_weekly_frame(daily: pd.DataFrame) -> pd.DataFrame:
    """Collapse daily OHLCV into one row per ISO week: weekly close (last),
    weekly high/low (max/min), and the AVERAGE daily volume that week."""
    daily = daily.copy()
    daily.index = pd.to_datetime(daily.index)
    weekly = daily.resample('W-FRI').agg(
        Close=('Close', 'last'),
        High=('High', 'max'),
        Low=('Low', 'min'),
        AvgDailyVolume=('Volume', 'mean'),
        TradingDays=('Close', 'count'),
    )
    weekly = weekly[weekly['TradingDays'] >= 3]  # drop holiday-shortened/partial weeks
    return weekly


def analyze_ticker(ticker: str, daily: pd.DataFrame) -> pd.DataFrame:
    weekly = build_weekly_frame(daily)
    if len(weekly) < RANGE_LOOKBACK_WEEKS + max(FORWARD_HORIZONS) + 2:
        return pd.DataFrame()

    weekly['VolDiffPct'] = weekly['AvgDailyVolume'].pct_change() * 100

    # Trailing range, EXCLUDING the current week, so we're checking whether
    # price was already inside the range BEFORE this week's volume jump.
    weekly['TrailingHigh'] = weekly['High'].shift(1).rolling(RANGE_LOOKBACK_WEEKS).max()
    weekly['TrailingLow'] = weekly['Low'].shift(1).rolling(RANGE_LOOKBACK_WEEKS).min()

    weekly['InsideRange'] = (
        (weekly['Close'] > weekly['TrailingLow'] * (1 + RANGE_BUFFER_PCT)) &
        (weekly['Close'] < weekly['TrailingHigh'] * (1 - RANGE_BUFFER_PCT))
    )

    for h in FORWARD_HORIZONS:
        weekly[f'FwdRet_{h}w'] = weekly['Close'].shift(-h) / weekly['Close'] - 1.0

    weekly['Ticker'] = ticker
    return weekly.dropna(subset=['VolDiffPct', 'InsideRange'])


def summarize(df: pd.DataFrame, label: str):
    n = len(df)
    if n == 0:
        print(f"  {label}: no observations")
        return
    print(f"  {label}: n={n}")
    for h in FORWARD_HORIZONS:
        col = f'FwdRet_{h}w'
        sub = df[col].dropna()
        if len(sub) == 0:
            continue
        pct_up = (sub > 0).mean() * 100
        explosive_rate = (sub.abs() * 100 > EXPLOSIVE_MOVE_PCT).mean() * 100
        print(
            f"    +{h}w  mean={sub.mean()*100:6.2f}%  median={sub.median()*100:6.2f}%  "
            f"%up={pct_up:5.1f}%  %explosive(|ret|>{EXPLOSIVE_MOVE_PCT}%)={explosive_rate:5.1f}%"
        )


def main():
    tickers = get_ticker_universe()
    print(f"Downloading {PERIOD} of daily data for {len(tickers)} symbols...")
    raw = yf.download(tickers, period=PERIOD, interval="1d", group_by="ticker", progress=True, threads=True)

    all_weekly = []
    for ticker in tickers:
        try:
            if ticker not in raw.columns.get_level_values(0):
                continue
            daily = raw[ticker].dropna(subset=['Close'])
            if len(daily) < 100:
                continue
            wk = analyze_ticker(ticker, daily)
            if not wk.empty:
                all_weekly.append(wk)
        except Exception as e:
            print(f"  skip {ticker}: {e}")
            continue

    if not all_weekly:
        print("No usable data downloaded -- check network/yfinance access.")
        return

    combined = pd.concat(all_weekly, ignore_index=False)
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backtest_weekly_volume_results.csv')
    combined.to_csv(out_path)
    print(f"\nSaved {len(combined)} weekly observations to {out_path}\n")

    baseline = combined[combined['InsideRange']]
    print("=" * 70)
    print("BASELINE -- all in-range weeks, regardless of volume")
    print("=" * 70)
    summarize(baseline, "All in-range weeks")

    for threshold in VOLUME_THRESHOLDS:
        flagged = combined[(combined['InsideRange']) & (combined['VolDiffPct'] > threshold)]
        print("\n" + "=" * 70)
        print(f"FLAGGED -- in-range AND weekly avg volume up >{threshold}% vs prior week")
        print("=" * 70)
        summarize(flagged, f">{threshold}% volume jump")

    print("\nDone. Compare each '%explosive' and 'mean' row against the BASELINE block above:")
    print("  - If %explosive and |mean return| are clearly HIGHER than baseline -> the volume")
    print("    signal has real predictive value for an upcoming big move.")
    print("  - If %up stays near 50% even when flagged -> volume predicts a move is coming,")
    print("    but not which direction (use CVD/absorption to decide direction, as today).")
    print("  - If the flagged numbers look statistically the same as baseline -> the original")
    print("    Groww screenshot was likely just showing coincident volume on an already-moved")
    print("    stock, not a genuine leading indicator.")


if __name__ == '__main__':
    main()
