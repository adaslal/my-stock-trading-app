#!/usr/bin/env python3
"""
Highest-traded NSE stocks for any given date -- entire market, not just Nifty500.

Downloads NSE's official end-of-day bhavcopy for the date you pick (the same
underlying data behind NSE's "Most Active Securities" page and brokers like
Groww), filters to normal equity (SERIES = EQ) listings, and ranks every one
of them by shares traded that day. This is a historical lookup -- it answers
"what were the highest-traded stocks on date X", not a live/intraday feed.

Usage:
    python3 most_active_by_date.py 26-06-2026
    python3 most_active_by_date.py 26-06-2026 --top 30
    python3 most_active_by_date.py 26-06-2026 --sort value
    python3 most_active_by_date.py 26-06-2026 --order asc
    python3 most_active_by_date.py 26-06-2026 --csv out.csv

Notes:
    - NSE only publishes a bhavcopy for trading days. Weekends/holidays will
      fail with a clear message -- try the previous trading day.
    - Source: NSE's official daily bhavcopy archive (nsearchives.nseindia.com),
      free, no login/API key/broker account needed.
    - NSE changed bhavcopy formats on 8-Jul-2024 (old "cm*bhav.csv" -> new
      "UDiFF" file). This script handles both automatically based on the date
      you ask for.
    - The VALUE column is computed as TtlTrfVal / 100000 to express it in
      lakhs (matching NSE's own "VALUE (Rs. Lakhs)" convention). If NSE ever
      changes that field's units, this number would need rescaling -- the
      first time you run this, it's worth eyeballing one familiar stock's
      VALUE against NSE's live "Most Active Securities" page to confirm it
      lines up.
"""

import argparse
import csv
import io
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import datetime

ARCHIVE_BASE = "https://nsearchives.nseindia.com"
UDIFF_SWITCH_DATE = datetime(2024, 7, 8).date()
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _fetch(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Referer": "https://www.nseindia.com/all-reports",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


def _bhavcopy_url(trade_date):
    if trade_date < UDIFF_SWITCH_DATE:
        # Legacy format, used up to 5-Jul-2024 (Friday before the switch)
        date_str = trade_date.strftime("%d%b%Y").upper()  # e.g. 02JAN2023
        month = date_str[2:5]
        return (
            f"{ARCHIVE_BASE}/content/historical/EQUITIES/"
            f"{trade_date.year}/{month}/cm{date_str}bhav.csv.zip"
        )
    # Current "UDiFF" format, used from 8-Jul-2024 onward
    return (
        f"{ARCHIVE_BASE}/content/cm/BhavCopy_NSE_CM_0_0_0_"
        f"{trade_date.strftime('%Y%m%d')}_F_0000.csv.zip"
    )


def download_bhavcopy(trade_date):
    """Download and unzip the bhavcopy for trade_date. Returns raw CSV text."""
    url = _bhavcopy_url(trade_date)
    try:
        raw = _fetch(url)
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"NSE has no bhavcopy at this URL for {trade_date:%d-%b-%Y} "
            f"(HTTP {e.code}). Most likely a weekend/market holiday, or a "
            f"date in the future. URL tried: {url}"
        ) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Could not reach NSE archives: {e}") from e

    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            csv_name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
            return zf.read(csv_name).decode("utf-8")
    except zipfile.BadZipFile as e:
        raise RuntimeError(
            "NSE responded but didn't return a valid zip file -- this usually "
            "means the request got blocked or rate-limited rather than the "
            "date being wrong. Wait a few seconds and try again."
        ) from e


def parse_rows(csv_text, trade_date):
    """Normalize either bhavcopy schema (legacy or UDiFF) into a common list of dicts."""
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = []
    is_udiff = trade_date >= UDIFF_SWITCH_DATE

    for row in reader:
        try:
            if is_udiff:
                series = (row.get("SctySrs") or "").strip()
                if series != "EQ":
                    continue
                symbol = (row.get("TckrSymb") or "").strip()
                volume = int(float(row["TtlTradgVol"]))
                value_lakhs = float(row["TtlTrfVal"]) / 100000.0
                close = float(row["ClsPric"])
                prev_close = float(row["PrvsClsgPric"])
            else:
                series = (row.get("SERIES") or "").strip()
                if series != "EQ":
                    continue
                symbol = (row.get("SYMBOL") or "").strip()
                volume = int(float(row["TOTTRDQTY"]))
                value_lakhs = float(row["TOTTRDVAL"]) / 100000.0
                close = float(row["CLOSE"])
                prev_close = float(row["PREVCLOSE"])
        except (KeyError, ValueError):
            continue

        if not symbol:
            continue

        pct_chg = ((close - prev_close) / prev_close * 100.0) if prev_close else 0.0
        rows.append(
            {
                "symbol": symbol,
                "close": close,
                "pct_chg": pct_chg,
                "volume": volume,
                "value_lakhs": value_lakhs,
            }
        )
    return rows


def main():
    ap = argparse.ArgumentParser(description="Highest-traded NSE stocks for a given date")
    ap.add_argument("date", help="Trading date, format DD-MM-YYYY (e.g. 26-06-2026)")
    ap.add_argument("--top", type=int, default=20, help="How many stocks to show (default 20)")
    ap.add_argument(
        "--sort", choices=["volume", "value", "pct_chg"], default="volume",
        help="Rank by shares traded (volume), turnover in rupees (value), or %% change (pct_chg). Default: volume",
    )
    ap.add_argument(
        "--order", choices=["desc", "asc"], default="desc",
        help="desc = highest traded first (default), asc = lowest traded first",
    )
    ap.add_argument("--csv", metavar="PATH", help="Optional: also save the full ranked list to this CSV path")
    args = ap.parse_args()

    try:
        trade_date = datetime.strptime(args.date, "%d-%m-%Y").date()
    except ValueError:
        sys.exit(f"Couldn't parse date '{args.date}'. Use DD-MM-YYYY, e.g. 26-06-2026")

    if trade_date > datetime.now().date():
        sys.exit("That date is in the future -- NSE has no bhavcopy for it yet.")

    print(f"Fetching NSE bhavcopy for {trade_date:%d-%b-%Y (%A)}...")
    try:
        csv_text = download_bhavcopy(trade_date)
    except RuntimeError as e:
        sys.exit(str(e))

    rows = parse_rows(csv_text, trade_date)
    if not rows:
        sys.exit("Downloaded the file but found no EQ-series rows -- NSE may have changed the schema again.")

    key = {"volume": "volume", "value": "value_lakhs", "pct_chg": "pct_chg"}[args.sort]
    rows.sort(key=lambda r: r[key], reverse=(args.order == "desc"))
    top_rows = rows[: args.top]

    label = {"volume": "Volume (Shares)", "value": "Value (Rs. Lakhs)", "pct_chg": "%Chg"}[args.sort]
    print(f"\n{len(rows)} EQ-series stocks traded on {trade_date:%d-%b-%Y}. "
          f"Top {len(top_rows)} by {args.sort} ({args.order}ending):\n")
    print(f"{'Rank':<5}{'Symbol':<15}{'Close':>10}{'%Chg':>9}{label:>20}")
    print("-" * 60)
    for i, r in enumerate(top_rows, 1):
        if args.sort == "volume":
            metric = f"{r['volume']:,}"
        elif args.sort == "value":
            metric = f"{r['value_lakhs']:,.2f}"
        else:
            metric = f"{r['pct_chg']:+,.2f}"
        print(f"{i:<5}{r['symbol']:<15}{r['close']:>10.2f}{r['pct_chg']:>+9.2f}{metric:>20}")

    if args.csv:
        with open(args.csv, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["symbol", "close", "pct_chg", "volume", "value_lakhs"])
            writer.writeheader()
            for r in rows:
                writer.writerow(r)
        print(f"\nFull ranked list ({len(rows)} stocks) saved to {args.csv}")


if __name__ == "__main__":
    main()
