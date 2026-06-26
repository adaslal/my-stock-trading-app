import { useState, useEffect } from 'react';
import { calculatePAVP, type Candle, type PAVPResult } from './pavpEngine';
import { INDIAN_WATCHLIST, generateHistoricalData } from './mockData';
import { Search, RefreshCw, Layers, ArrowUpDown } from 'lucide-react';


interface ScannedStock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  candles: Candle[];
  result: PAVPResult;
  capSize: 'large' | 'mid' | 'small';
}

const isExplosiveSetup = (price: number, result: PAVPResult) => {
  const vp = result.volumeProfile;
  if (!vp) return false;

  // 1. The present day candle close lies between VAH and Profile High (p high)
  const inRange = price >= vp.vah && price <= vp.highestPrice;

  // 2. The present day candle has an upward fuchsia arrow (isBullishAbsorption)
  const hasArrow = result.vdu.isBullishAbsorption;

  return inRange && hasArrow;
};

// Mirror of isExplosiveSetup for the downside: the breakdown/short equivalent.
// VAL -> P Low zone (mirrors VAH -> P High) plus a downward fuchsia arrow (trapped buyers).
const isCollapseSetup = (price: number, result: PAVPResult) => {
  const vp = result.volumeProfile;
  if (!vp) return false;

  // 1. The present day candle close lies between Profile Low (p low) and VAL
  const inRange = price >= vp.lowestPrice && price <= vp.val;

  // 2. The present day candle has a downward fuchsia arrow (isBearishAbsorption)
  const hasArrow = result.vdu.isBearishAbsorption;

  return inRange && hasArrow;
};

export default function App() {
  const [stocks, setStocks] = useState<ScannedStock[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Where the on-screen data actually came from. 'real' = scan_real_market.py snapshot
  // (Yahoo Finance data), 'mock' = fully synthetic generateHistoricalData() fallback.
  // Used to make sure we never fabricate price ticks on top of real market data.
  const [dataSource, setDataSource] = useState<'real' | 'mock'>('mock');
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  
  // Filter States
  const [selectedCapSize, setSelectedCapSize] = useState<'all' | 'large' | 'mid' | 'small'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'support' | 'resistance' | 'inside'>('all');
  // Setup direction filter: 'all' = no filter, 'long' = explosive (VAH->P High) setups only,
  // 'short' = breakdown (VAL->P Low) setups only. Mutually exclusive since a stock can't be both.
  const [setupFilter, setSetupFilter] = useState<'all' | 'long' | 'short'>('all');
  
  // Sorting State
  const [sortBy, setSortBy] = useState<'proximity' | 'ticker' | 'change'>('proximity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // 1. Initialise all baseline watchlists on load
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      
      try {
        const response = await fetch('/real_breakouts.json');
        if (response.ok) {
          const realData = await response.json();

          // New format: { generatedAt, dataSource, stocks: [...] } (written by the
          // updated scan_real_market.py). Old format: a bare array (legacy snapshots
          // generated before freshness stamping was added) -- still supported so we
          // don't break on a stale file that hasn't been re-scanned yet.
          let stockList: ScannedStock[] | null = null;
          let stamp: string | null = null;

          if (Array.isArray(realData) && realData.length > 0) {
            stockList = realData;
          } else if (realData && Array.isArray(realData.stocks) && realData.stocks.length > 0) {
            stockList = realData.stocks;
            stamp = typeof realData.generatedAt === 'string' ? realData.generatedAt : null;
          }

          if (stockList) {
            setStocks(stockList);
            setDataSource('real');
            setGeneratedAt(stamp);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Could not load real market breakouts, falling back to simulated data", err);
      }

      // Fallback to simulated data
      const scannedList: ScannedStock[] = INDIAN_WATCHLIST.map(item => {
        const candles = generateHistoricalData(item, 250);
        const result = calculatePAVP(candles, 20, 25, 0.68);
        const latestCandle = candles[candles.length - 1];
        const previousCandle = candles[candles.length - 2];

        const price = latestCandle.close;
        const change = ((latestCandle.close - previousCandle.close) / previousCandle.close) * 100;

        return {
          ticker: item.ticker,
          name: item.name,
          price,
          change,
          candles,
          result,
          capSize: item.capSize
        };
      });

      setStocks(scannedList);
      setDataSource('mock');
      setGeneratedAt(null);
      setIsLoading(false);
    };

    initializeData();
  }, []);

  // 2. Simulated price ticking -- DEMO DATA ONLY.
  // This fabricates intraday price movement (and used to clamp "explosive" tickers
  // into the VAH->P High zone regardless of what the real market was doing). That
  // clamp was getting applied to real Yahoo Finance snapshots too (e.g. REDINGTON,
  // CUMMINSIND), manufacturing a fake "explosive" signal that didn't match the real
  // chart/indicator. Real snapshot data is a static end-of-day scan, not a live feed,
  // so it must never be mutated client-side -- only the synthetic mock fallback ticks.
  useEffect(() => {
    if (!isAutoRefresh || stocks.length === 0 || dataSource !== 'mock') return;

    const interval = setInterval(() => {
      setStocks(prevStocks => {
        return prevStocks.map(stock => {
          // 40% chance of price movement per tick
          const shouldUpdate = Math.random() < 0.40;
          if (!shouldUpdate) return stock;

          const updatedCandles = [...stock.candles];
          if (updatedCandles.length === 0) return stock;

          const lastCandle = { ...updatedCandles[updatedCandles.length - 1] };
          const prevCandle = updatedCandles[updatedCandles.length - 2] || lastCandle;

          // Intraday price movement (-0.2% to +0.25%)
          const pctChange = (Math.random() * 0.45 - 0.2) / 100;
          lastCandle.close = +(lastCandle.close * (1 + pctChange)).toFixed(2);

          // For explosive setup watchlists, clamp the price to stay between VAH and Profile High
          const tempResult = calculatePAVP(updatedCandles, 20, 25, 0.68);
          if (tempResult.volumeProfile && (stock.ticker === 'KPIGREEN.NS' || stock.ticker === 'SUZLON.NS' || stock.ticker === 'HAL.NS' || isExplosiveSetup(stock.price, stock.result))) {
            const vp = tempResult.volumeProfile;
            const buffer = 0.05 * (vp.highestPrice - vp.vah);
            const minAllowed = vp.vah + buffer;
            const maxAllowed = vp.highestPrice - buffer;
            if (lastCandle.close < minAllowed) {
              lastCandle.close = +minAllowed.toFixed(2);
            } else if (lastCandle.close > maxAllowed) {
              lastCandle.close = +maxAllowed.toFixed(2);
            }
          }

          if (lastCandle.close > lastCandle.high) lastCandle.high = lastCandle.close;
          if (lastCandle.close < lastCandle.low) lastCandle.low = lastCandle.close;

          updatedCandles[updatedCandles.length - 1] = lastCandle;

          // Recalculate indicators
          const result = calculatePAVP(updatedCandles, 20, 25, 0.68);
          const price = lastCandle.close;
          const change = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;

          return {
            ...stock,
            price,
            change,
            candles: updatedCandles,
            result
          };
        });
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoRefresh, stocks.length, dataSource]);

  // Helper: Get Proximity Status Object
  const getProximityStatus = (price: number, result: PAVPResult, proximityBuffer: number = 0.3) => {
    const vp = result.volumeProfile;
    const pLow = vp ? vp.lowestPrice : price;
    const pHigh = vp ? vp.highestPrice : price;

    const distL = ((price - pLow) / pLow) * 100;
    const distH = ((pHigh - price) / pHigh) * 100;

    if (price <= pLow || Math.abs(distL) <= proximityBuffer) {
      return {
        text: '🟢 AT SUPPORT (P LOW)',
        bgColor: 'rgba(16, 185, 129, 0.15)',
        textColor: 'var(--color-green)',
        borderColor: 'rgba(16, 185, 129, 0.35)',
        category: 'support',
        distL,
        distH,
        pLow,
        pHigh
      };
    } else if (distL <= proximityBuffer * 3.0) {
      return {
        text: '⏳ NEAR SUPPORT',
        bgColor: 'rgba(16, 185, 129, 0.08)',
        textColor: 'var(--color-green)',
        borderColor: 'rgba(16, 185, 129, 0.2)',
        category: 'support',
        distL,
        distH,
        pLow,
        pHigh
      };
    } else if (price >= pHigh || Math.abs(distH) <= proximityBuffer) {
      return {
        text: '🔴 AT RESISTANCE (P HIGH)',
        bgColor: 'rgba(239, 68, 68, 0.15)',
        textColor: 'var(--color-red)',
        borderColor: 'rgba(239, 68, 68, 0.35)',
        category: 'resistance',
        distL,
        distH,
        pLow,
        pHigh
      };
    } else if (distH <= proximityBuffer * 3.0) {
      return {
        text: '⏳ NEAR RESISTANCE',
        bgColor: 'rgba(239, 68, 68, 0.08)',
        textColor: 'var(--color-red)',
        borderColor: 'rgba(239, 68, 68, 0.2)',
        category: 'resistance',
        distL,
        distH,
        pLow,
        pHigh
      };
    } else {
      return {
        text: '⚪ INSIDE RANGE',
        bgColor: 'rgba(255, 255, 255, 0.02)',
        textColor: 'var(--text-secondary)',
        borderColor: 'var(--border-glass)',
        category: 'inside',
        distL,
        distH,
        pLow,
        pHigh
      };
    }
  };

  // 3. Filter Logic
  const filteredStocks = stocks.filter(stock => {
    // Ticker / Name Search filter
    const matchesSearch = 
      stock.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Market Cap Filter
    const matchesCap = selectedCapSize === 'all' || stock.capSize === selectedCapSize;
    
    // Proximity Status Filter
    const statusInfo = getProximityStatus(stock.price, stock.result);
    const matchesStatus = selectedStatus === 'all' || statusInfo.category === selectedStatus;

    // Setup Direction Filter (Long/Explosive vs Short/Breakdown)
    const matchesSetupFilter =
      setupFilter === 'all' ||
      (setupFilter === 'long' && isExplosiveSetup(stock.price, stock.result)) ||
      (setupFilter === 'short' && isCollapseSetup(stock.price, stock.result));

    return matchesSearch && matchesCap && matchesStatus && matchesSetupFilter;
  });

  // 4. Sort Logic
  const sortedStocks = [...filteredStocks].sort((a, b) => {
    let valueA: any = 0;
    let valueB: any = 0;

    if (sortBy === 'ticker') {
      valueA = a.ticker;
      valueB = b.ticker;
    } else if (sortBy === 'change') {
      valueA = a.change;
      valueB = b.change;
    } else {
      // Sort by absolute distance to nearest range boundary (p low or p high)
      const getMinDist = (s: ScannedStock) => {
        const status = getProximityStatus(s.price, s.result);
        return Math.min(Math.abs(status.distL), Math.abs(status.distH));
      };
      valueA = getMinDist(a);
      valueB = getMinDist(b);
    }

    if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
    if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: 'proximity' | 'ticker' | 'change') => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', color: '#fff' }}>
      
      {/* 1. Header Navigation Bar */}
      <header 
        style={{ 
          height: '72px', 
          borderBottom: '1px solid var(--border-glass)', 
          background: 'rgba(9, 13, 22, 0.7)', 
          backdropFilter: 'blur(20px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 32px',
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div 
            style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'linear-gradient(135deg, var(--color-cyan) 0%, var(--color-blue) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--glow-blue)'
            }}
          >
            <Layers size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '900', fontFamily: 'Outfit', color: '#fff', letterSpacing: '0.04em', lineHeight: '1.2' }}>
              AEGIS <span style={{ color: 'var(--color-cyan)' }}>PAVP</span> SCREENER
            </h1>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: '800' }}>
              Multi-Cap Institutional Range Proximity Engine
            </span>
          </div>
        </div>

        {/* Global Controller */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div 
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '8px 16px', 
              background: isAutoRefresh ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255,255,255,0.02)', 
              border: `1px solid ${isAutoRefresh ? 'rgba(6, 182, 212, 0.3)' : 'var(--border-glass)'}`, 
              borderRadius: '8px',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <div 
              style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: isAutoRefresh ? 'var(--color-cyan)' : 'var(--text-muted)',
                animation: isAutoRefresh ? 'pulse-green 1.5s infinite ease-in-out' : 'none'
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: '700', color: isAutoRefresh ? '#fff' : 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              {isAutoRefresh ? 'LIVE AUTO' : 'PAUSED'}
            </span>
            <RefreshCw 
              size={12} 
              style={{ 
                color: isAutoRefresh ? 'var(--color-cyan)' : 'var(--text-muted)',
                animation: isAutoRefresh ? 'spin 3s linear infinite' : 'none'
              }} 
            />
          </div>

          <div style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '8px', textAlign: 'center' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Stocks Scanned</span>
            <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--color-cyan)' }}>{stocks.length} NSE Tickers</span>
          </div>

          <div
            title={dataSource === 'real'
              ? 'Loaded from a static scan_real_market.py snapshot of real Yahoo Finance data. Prices do not tick live and will not change until the scanner is re-run.'
              : 'No real snapshot found -- showing fully synthetic demo data for UI preview only.'}
            style={{
              padding: '6px 14px',
              background: dataSource === 'real' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${dataSource === 'real' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '8px',
              textAlign: 'center',
              cursor: 'help'
            }}
          >
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
              {dataSource === 'real' ? '🟢 Live Snapshot' : '🟠 Simulated Demo Data'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: '700', color: dataSource === 'real' ? 'var(--color-green)' : 'var(--color-red)' }}>
              {dataSource === 'real'
                ? (generatedAt ? `Data as of ${new Date(generatedAt).toLocaleString()}` : 'Data as of: unknown (legacy snapshot)')
                : 'Not real market data'}
            </span>
          </div>
        </div>
      </header>

      {/* 2. Main Screener Grid Panel */}
      <main style={{ flex: 1, padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
        
        {/* Filter Toolbar Card */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
          
          {/* Search bar */}
          <div style={{ position: 'relative', width: '320px' }}>
            <input
              type="text"
              placeholder="Search ticker or stock name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 42px',
                backgroundColor: 'rgba(6, 9, 19, 0.6)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                color: '#fff',
                outline: 'none',
                fontSize: '13px',
                transition: 'var(--transition-smooth)'
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(6, 182, 212, 0.4)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border-glass)')}
            />
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-muted)' }} />
          </div>

          {/* Filters Stack */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
            
            {/* Market Cap Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Market Cap:</span>
              <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                {(['all', 'large', 'mid', 'small'] as const).map(cap => {
                  const isActive = selectedCapSize === cap;
                  const label = cap === 'all' ? 'All' : cap.toUpperCase();
                  const pillColor = 
                    cap === 'large' ? 'var(--color-green)' :
                    cap === 'mid' ? 'var(--color-gold)' :
                    cap === 'small' ? 'var(--color-purple)' : 'var(--color-cyan)';

                  return (
                    <button
                      key={cap}
                      onClick={() => setSelectedCapSize(cap)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: isActive ? pillColor : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Proximity Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Proximity:</span>
              <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                {[
                  { value: 'all', label: 'All' },
                  { value: 'support', label: '🟢 Support' },
                  { value: 'resistance', label: '🔴 Resistance' },
                  { value: 'inside', label: '⚪ Inside Range' }
                ].map(opt => {
                  const isActive = selectedStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSelectedStatus(opt.value as any)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: isActive ? '#fff' : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)'
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Setup Direction Filter (Long/Explosive vs Short/Breakdown) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Setups:</span>
              <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                {[
                  { value: 'all', label: 'All' },
                  { value: 'long', label: '🚀 EXPLOSIVE (LONG)' },
                  { value: 'short', label: '🔻 BREAKDOWN (SHORT)' }
                ].map(opt => {
                  const isActive = setupFilter === opt.value;
                  const activeColor = opt.value === 'long' ? 'var(--color-pink)' : opt.value === 'short' ? 'var(--color-gold)' : '#fff';
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSetupFilter(opt.value as any)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        backgroundColor: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: isActive ? activeColor : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)',
                        userSelect: 'none'
                      }}
                    >
                      <span>{opt.label}</span>
                      {isActive && opt.value !== 'all' && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: activeColor,
                            display: 'inline-block',
                            animation: `pulse-${opt.value === 'long' ? 'pink' : 'gold'} 1.5s infinite ease-in-out`
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* Screener Table Card */}
        <div className="glass-panel" style={{ overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {/* Table Container with scrollbar */}
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(9, 13, 22, 0.4)', borderBottom: '1px solid var(--border-glass)' }}>
                  <th 
                    onClick={() => toggleSort('ticker')} 
                    style={{ padding: '16px 24px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Ticker & Name
                      <ArrowUpDown size={12} style={{ color: sortBy === 'ticker' ? 'var(--color-cyan)' : 'var(--text-muted)' }} />
                    </div>
                  </th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Cap size</th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' }}>Last price</th>
                  <th 
                    onClick={() => toggleSort('change')}
                    style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                      24h change
                      <ArrowUpDown size={12} style={{ color: sortBy === 'change' ? 'var(--color-cyan)' : 'var(--text-muted)' }} />
                    </div>
                  </th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'center' }}>CVD Signal</th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'center' }}>Direction</th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' }}>P Low (Support)</th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' }}>P Low Diff (%)</th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' }}>P High (Resistance)</th>
                  <th style={{ padding: '16px 20px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', textAlign: 'right' }}>P High Diff (%)</th>
                  <th 
                    onClick={() => toggleSort('proximity')}
                    style={{ padding: '16px 24px', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Proximity status
                      <ArrowUpDown size={12} style={{ color: sortBy === 'proximity' ? 'var(--color-cyan)' : 'var(--text-muted)' }} />
                    </div>
                  </th>
                </tr>
              </thead>
              
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} style={{ padding: '120px 0', textAlign: 'center' }}>
                      <RefreshCw size={32} style={{ animation: 'spin 3s linear infinite', color: 'var(--color-cyan)', margin: '0 auto 16px auto' }} />
                      <span style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'block' }}>Running PAVP volume profile scans...</span>
                    </td>
                  </tr>
                ) : sortedStocks.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                      No stocks found matching the active filter criteria.
                    </td>
                  </tr>
                ) : (
                  sortedStocks.map((stock) => {
                    const { text, bgColor, textColor, borderColor, distL, distH, pLow, pHigh } = getProximityStatus(stock.price, stock.result);
                    
                    const capColors = 
                      stock.capSize === 'large' ? { text: 'var(--color-green)', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.2)' } :
                      stock.capSize === 'mid' ? { text: 'var(--color-gold)', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.2)' } :
                      { text: 'var(--color-purple)', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.2)' };

                    return (
                      <tr 
                        key={stock.ticker}
                        style={{ 
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          transition: 'var(--transition-smooth)',
                          background: 'rgba(0,0,0,0.05)'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.03)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
                      >
                        {/* Ticker & Name */}
                        <td style={{ padding: '14px 24px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: '800', fontSize: '14px', color: '#fff', display: 'block' }}>
                              {stock.ticker.replace('.NS', '')}
                            </span>
                            {isExplosiveSetup(stock.price, stock.result) && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: '800',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(236, 72, 153, 0.15)',
                                  color: 'var(--color-pink)',
                                  border: '1px solid rgba(236, 72, 153, 0.3)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  boxShadow: 'var(--glow-pink)'
                                }}
                              >
                                🚀 EXPLOSIVE
                              </span>
                            )}
                            {isCollapseSetup(stock.price, stock.result) && (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: '800',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                  color: 'var(--color-gold)',
                                  border: '1px solid rgba(245, 158, 11, 0.3)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  boxShadow: 'var(--glow-gold)'
                                }}
                              >
                                🔻 BREAKDOWN
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {stock.name}
                          </span>
                        </td>
                        
                        {/* Cap Size */}
                        <td style={{ padding: '14px 20px' }}>
                          <span 
                            style={{ 
                              fontSize: '10px', 
                              fontWeight: '800', 
                              padding: '3px 8px', 
                              borderRadius: '4px',
                              backgroundColor: capColors.bg,
                              color: capColors.text,
                              border: `1px solid ${capColors.border}`,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em'
                            }}
                          >
                            {stock.capSize} Cap
                          </span>
                        </td>

                        {/* Last Price */}
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '800', color: '#fff' }}>
                          ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Daily Change */}
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: stock.change >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                          {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                        </td>

                        {/* CVD Signal -- raw order-flow direction on the latest candle, based on CVD + volume.
                            Independent of price zone: tells you bullish/bearish absorption bias even
                            when the stock isn't sitting inside an Explosive/Breakdown zone. */}
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          {stock.result.vdu.isBullishAbsorption ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: '800', color: 'var(--color-cyan)' }}>
                              ▲ BULLISH
                            </span>
                          ) : stock.result.vdu.isBearishAbsorption ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: '800', color: 'var(--color-gold)' }}>
                              ▼ BEARISH
                            </span>
                          ) : (
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>–</span>
                          )}
                        </td>

                        {/* Direction -- which zone-confirmed setup (if any) the latest candle qualifies for */}
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          {isExplosiveSetup(stock.price, stock.result) ? (
                            <span
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '800',
                                backgroundColor: 'rgba(236, 72, 153, 0.15)', color: 'var(--color-pink)',
                                border: '1px solid rgba(236, 72, 153, 0.3)'
                              }}
                            >
                              🚀 LONG
                            </span>
                          ) : isCollapseSetup(stock.price, stock.result) ? (
                            <span
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '800',
                                backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-gold)',
                                border: '1px solid rgba(245, 158, 11, 0.3)'
                              }}
                            >
                              🔻 SHORT
                            </span>
                          ) : (
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>–</span>
                          )}
                        </td>

                        {/* P Low Price */}
                        <td style={{ padding: '14px 20px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>
                          ₹{pLow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* P Low Diff */}
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: 'var(--color-green)' }}>
                          {distL >= 0 ? '+' : ''}{distL.toFixed(2)}%
                        </td>

                        {/* P High Price */}
                        <td style={{ padding: '14px 20px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: '600' }}>
                          ₹{pHigh.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* P High Diff */}
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: '700', color: 'var(--color-red)' }}>
                          {distH.toFixed(2)}%
                        </td>

                        {/* Proximity Status */}
                        <td style={{ padding: '14px 24px' }}>
                          <div 
                            style={{ 
                              display: 'inline-flex',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              backgroundColor: bgColor,
                              border: `1px solid ${borderColor}`,
                              color: textColor,
                              fontSize: '11px',
                              fontWeight: '800',
                              justifyContent: 'center',
                              minWidth: '150px'
                            }}
                          >
                            {text}
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </main>

    </div>
  );
}
