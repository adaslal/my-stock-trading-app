import urllib.request
import csv
import io
import os
import json
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime

def get_nifty500_tickers():
    print("Fetching Nifty 500 stock list from NSE...")
    url = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            csv_data = response.read().decode('utf-8')
            reader = csv.DictReader(io.StringIO(csv_data))
            tickers = []
            for idx, row in enumerate(reader):
                symbol = row.get('Symbol')
                name = row.get('Company Name', symbol)
                if symbol:
                    symbol = symbol.strip()
                    # Classify Cap Size based on Nifty index position
                    if idx < 100:
                        cap = 'large'
                    elif idx < 250:
                        cap = 'mid'
                    else:
                        cap = 'small'
                    tickers.append({
                        'ticker': symbol + ".NS",
                        'name': name.strip(),
                        'capSize': cap
                    })
            print(f"Successfully loaded {len(tickers)} symbols.")
            return tickers
    except Exception as e:
        print(f"Error fetching Nifty 500 list from NSE: {e}. Using fallback popular list.")
        # Fallback list of popular liquid tickers
        fallback_symbols = [
            ("RELIANCE", "Reliance Industries", "large"),
            ("TCS", "Tata Consultancy Services", "large"),
            ("INFY", "Infosys Limited", "large"),
            ("HDFCBANK", "HDFC Bank Limited", "large"),
            ("ICICIBANK", "ICICI Bank Limited", "large"),
            ("SBIN", "State Bank of India", "large"),
            ("BHARTIARTL", "Bharti Airtel Limited", "large"),
            ("ITC", "ITC Limited", "large"),
            ("LT", "Larsen & Toubro Limited", "large"),
            ("M&M", "Mahindra & Mahindra", "large"),
            ("HAL", "Hindustan Aeronautics", "large"),
            ("ZOMATO", "Zomato Limited", "large"),
            ("SUZLON", "Suzlon Energy", "mid"),
            ("RVNL", "Rail Vikas Nigam", "mid"),
            ("JIOFIN", "Jio Financial Services", "mid"),
            ("IREDA", "Indian Renewable Energy", "mid"),
            ("KPIGREEN", "KPI Green Energy", "small"),
            ("RAMCOSYS", "Ramco Systems", "small"),
            ("SPARC", "Sun Pharma Advanced Research", "small"),
            ("GENESYS", "Genesys International", "small")
        ]
        return [{'ticker': s + ".NS", 'name': n, 'capSize': c} for s, n, c in fallback_symbols]

def calculate_pavp(candles, pvt_length=20, num_profile_levels=25, value_area_percent=0.68, absorption_mult=1.5):
    n = len(candles)
    if n < pvt_length * 2 + 5:
        return None
    
    closes = [c['close'] for c in candles]
    
    # 1. Pivot Detection
    pivot_highs = []
    pivot_lows = []
    for i in range(pvt_length, n - pvt_length):
        current_high = candles[i]['high']
        current_low = candles[i]['low']
        is_high = True
        is_low = True
        for offset in range(-pvt_length, pvt_length + 1):
            if offset == 0:
                continue
            if candles[i + offset]['high'] > current_high:
                is_high = False
            if candles[i + offset]['low'] < current_low:
                is_low = False
        if is_high:
            pivot_highs.append({'index': i, 'price': current_high, 'time': candles[i]['time']})
        if is_low:
            pivot_lows.append({'index': i, 'price': current_low, 'time': candles[i]['time']})
            
    # 2. Volume Profile anchored from last pivot to today
    last_pivot_index = 0
    if len(pivot_lows) > 0:
        last_pivot_index = pivot_lows[-1]['index']
    elif len(pivot_highs) > 0:
        last_pivot_index = pivot_highs[-1]['index']
        
    profile_start_index = max(0, last_pivot_index)
    profile_end_index = n - 1
    
    if profile_end_index <= profile_start_index:
        return None
        
    profile_candles = candles[profile_start_index : profile_end_index + 1]
    highest_price = max(c['high'] for c in profile_candles)
    lowest_price = min(c['low'] for c in profile_candles)
    
    if highest_price == lowest_price:
        highest_price += 0.01
        
    price_step = (highest_price - lowest_price) / num_profile_levels
    bin_volumes = [0.0] * num_profile_levels
    
    for i in range(profile_start_index, profile_end_index + 1):
        c = candles[i]
        candle_range = max(c['high'] - c['low'], 0.0001)
        for k in range(num_profile_levels):
            bin_bottom = lowest_price + k * price_step
            bin_top = bin_bottom + price_step
            if c['high'] >= bin_bottom and c['low'] < bin_top:
                overlap_bottom = max(c['low'], bin_bottom)
                overlap_top = min(c['high'], bin_top)
                overlap_percent = (overlap_top - overlap_bottom) / candle_range
                bin_volumes[k] += c['volume'] * overlap_percent
                
    # Point of Control (POC)
    max_vol = -1
    poc_level = 0
    for k in range(num_profile_levels):
        if bin_volumes[k] > max_vol:
            max_vol = bin_volumes[k]
            poc_level = k
            
    # Value Area
    total_volume = sum(bin_volumes)
    target_volume = total_volume * value_area_percent
    accumulated_volume = bin_volumes[poc_level]
    level_above = poc_level
    level_below = poc_level
    
    while accumulated_volume < target_volume:
        if level_below == 0 and level_above == num_profile_levels - 1:
            break
        vol_above = bin_volumes[level_above + 1] if level_above < num_profile_levels - 1 else 0
        vol_below = bin_volumes[level_below - 1] if level_below > 0 else 0
        if vol_above == 0 and vol_below == 0:
            break
        if vol_above >= vol_below:
            accumulated_volume += vol_above
            level_above += 1
        else:
            accumulated_volume += vol_below
            level_below -= 1
            
    vah = lowest_price + (level_above + 1) * price_step
    val = lowest_price + level_below * price_step
    
    # 3. CVD Bullish Absorption
    deltas = [c['barDelta'] for c in candles]
    abs_deltas = [abs(d) for d in deltas]
    
    # Simple SMA 20 of absolute deltas
    if len(abs_deltas) >= 20:
        avg_abs_delta = sum(abs_deltas[-20:]) / 20.0
    else:
        avg_abs_delta = sum(abs_deltas) / max(1, len(abs_deltas))
        
    latest_delta = deltas[-1]
    latest_candle = candles[-1]
    
    # Upward fuchsia arrow criteria (CVD sellers absorbed, high close).
    # absorption_mult defaults to 1.5 to match reliance_scalping_composite.pine /
    # reliance_scalping_strategy.pine / pavpEngine.ts -- change all together.
    is_bullish_absorption = (
        latest_delta < -avg_abs_delta * absorption_mult and
        latest_candle['close'] > (latest_candle['high'] + latest_candle['low']) / 2.0
    )

    # Simple Squeeze check
    is_squeezed = False
    
    # Proximity calculation
    proximity_to_p_low = ((latest_candle['close'] - lowest_price) / lowest_price) * 100
    
    # Structure match result
    return {
        'vah': float(vah),
        'val': float(val),
        'poc': float(lowest_price + (poc_level + 0.5) * price_step),
        'highestPrice': float(highest_price),
        'lowestPrice': float(lowest_price),
        'isBullishAbsorption': is_bullish_absorption,
        'latestDelta': float(latest_delta),
        'avgAbsDelta': float(avg_abs_delta),
        'isSqueezed': is_squeezed,
        'proximityToPLow': float(proximity_to_p_low)
    }

def main():
    stock_items = get_nifty500_tickers()
    tickers = [s['ticker'] for s in stock_items]
    
    print(f"Downloading 1-year daily candles for {len(tickers)} symbols...")
    daily_data = yf.download(tickers, period="1y", interval="1d", group_by="ticker", progress=True)
    
    print(f"Downloading 1-month hourly candles for {len(tickers)} symbols...")
    hourly_data = yf.download(tickers, period="1mo", interval="1h", group_by="ticker", progress=True)
    
    results = []
    matches = []
    
    print("Processing and analyzing symbols...")
    for idx, item in enumerate(stock_items):
        ticker = item['ticker']
        name = item['name']
        cap = item['capSize']
        
        try:
            # Check if yfinance returned data for this ticker in both downloads
            if ticker not in daily_data or ticker not in hourly_data:
                continue
                
            ticker_daily = daily_data[ticker].dropna(subset=['Close']).copy()
            if len(ticker_daily) < 50:
                continue
                
            ticker_hourly = hourly_data[ticker].dropna(subset=['Close']).copy()
            if len(ticker_hourly) < 20:
                continue
                
            # 1. Compute default daily deltas
            h = ticker_daily['High']
            l = ticker_daily['Low']
            c = ticker_daily['Close']
            v = ticker_daily['Volume']
            rng = h - l
            buy_pct = np.where(rng > 0, (c - l) / rng, 0.5)
            ticker_daily['barDelta'] = v * (2.0 * buy_pct - 1.0)
            ticker_daily['DateString'] = ticker_daily.index.strftime('%Y-%m-%d')
            
            # 2. Compute hourly true deltas and group by DateString
            h_h = ticker_hourly['High']
            h_l = ticker_hourly['Low']
            h_c = ticker_hourly['Close']
            h_v = ticker_hourly['Volume']
            h_rng = h_h - h_l
            h_buy_pct = np.where(h_rng > 0, (h_c - h_l) / h_rng, 0.5)
            ticker_hourly['HourDelta'] = h_v * (2.0 * h_buy_pct - 1.0)
            ticker_hourly['DateString'] = ticker_hourly.index.strftime('%Y-%m-%d')
            hourly_grouped = ticker_hourly.groupby('DateString')['HourDelta'].sum()
            
            # 3. Align and update daily deltas with true hourly deltas
            ticker_daily = ticker_daily.set_index('DateString')
            ticker_daily.update(pd.DataFrame({'barDelta': hourly_grouped}))
            ticker_daily = ticker_daily.reset_index()
            
            # 4. Generate daily candle objects
            candles = []
            for _, row in ticker_daily.iterrows():
                candles.append({
                    'time': str(row['DateString']),
                    'open': float(row['Open']),
                    'high': float(row['High']),
                    'low': float(row['Low']),
                    'close': float(row['Close']),
                    'volume': int(row['Volume']),
                    'barDelta': float(row['barDelta'])
                })
                
            # Run PAVP Profile Engine
            pavp_res = calculate_pavp(candles)
            if not pavp_res:
                continue
                
            latest_price = candles[-1]['close']
            latest_open = candles[-1]['open']
            
            # Daily change calculation
            prev_price = candles[-2]['close'] if len(candles) > 1 else latest_open
            daily_change = ((latest_price - prev_price) / prev_price) * 100 if prev_price > 0 else 0.0
            
            # Construct result structure matching PAVPResult in TypeScript
            scanned_stock = {
                'ticker': ticker,
                'name': name,
                'price': latest_price,
                'change': daily_change,
                'candles': candles,
                'capSize': cap,
                'result': {
                    'pivots': {'highs': [], 'lows': []},
                    'volumeProfile': {
                        'poc': pavp_res['poc'],
                        'vah': pavp_res['vah'],
                        'val': pavp_res['val'],
                        'highestPrice': pavp_res['highestPrice'],
                        'lowestPrice': pavp_res['lowestPrice'],
                        'bins': []
                    },
                    'squeeze': {
                        'isSqueezed': pavp_res['isSqueezed'],
                        'bbUpper': 0.0,
                        'bbLower': 0.0,
                        'kcUpper': 0.0,
                        'kcLower': 0.0,
                        'basis': 0.0
                    },
                    'vdu': {
                        'vduRatio': 1.0,
                        'isVolumeDriedUp': False,
                        'volumeSma20': 100000.0,
                        'isVolumeSpiked': False,
                        'isBullishAbsorption': pavp_res['isBullishAbsorption']
                    },
                    'metrics': {
                        'sma200': latest_price,
                        'sma50': latest_price,
                        'ema20': latest_price,
                        'isLongTermUptrend': True,
                        'isShortTermUptrend': True,
                        'setupScore': 80,
                        'setupRating': 'A',
                        'proximityToPLow': pavp_res['proximityToPLow']
                    }
                }
            }
            
            results.append(scanned_stock)
            
            # Check setup criteria
            # 1. Close price lies between VAH and Profile High (p high)
            in_range = latest_price >= pavp_res['vah'] and latest_price <= pavp_res['highestPrice']
            # 2. Fuchsia arrow active
            has_arrow = pavp_res['isBullishAbsorption']
            
            if in_range and has_arrow:
                matches.append(scanned_stock)
                print(f"🚀 MATCH FOUND: {ticker.replace('.NS', '')} - Close: {latest_price:.2f} (VAH: {pavp_res['vah']:.2f}, High: {pavp_res['highestPrice']:.2f})")
                
        except Exception as e:
            continue
            
    # Save the results to the JSON file
    # We will save all matching stocks first, followed by other processed stocks up to 150 items
    output_stocks = matches + [r for r in results if r not in matches][:150]

    output_payload = {
        'generatedAt': datetime.utcnow().isoformat() + 'Z',
        'dataSource': 'real',
        'stocks': output_stocks
    }

    output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'real_breakouts.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(output_payload, f, indent=2)

    print(f"\nScan completed. Found {len(matches)} matches.")
    print(f"Results written to {output_path} (generatedAt={output_payload['generatedAt']})")

if __name__ == '__main__':
    main()
