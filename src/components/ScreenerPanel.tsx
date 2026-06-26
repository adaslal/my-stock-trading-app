import React, { useState } from 'react';
import { Search, Flame, TrendingUp, Activity } from 'lucide-react';
import type { PAVPResult, Candle } from '../pavpEngine';

interface ScreenerItem {
  ticker: string;
  name: string;
  price: number;
  change: number;
  result: PAVPResult;
  candles?: Candle[];
  capSize: 'large' | 'mid' | 'small';
}


interface ScreenerPanelProps {
  items: ScreenerItem[];
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
  onAddTicker: (ticker: string) => void;
  isLoading: boolean;
}

export const ScreenerPanel: React.FC<ScreenerPanelProps> = ({
  items,
  selectedTicker,
  onSelectTicker,
  onAddTicker,
  isLoading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'screener' | 'nifty' | 'watchlist'>('screener');
  const [sortBy, setSortBy] = useState<'setup' | 'volume'>('setup');
  const [selectedCapSize, setSelectedCapSize] = useState<'all' | 'large' | 'mid' | 'small'>('all');

  const handleSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    let ticker = searchQuery.trim().toUpperCase();
    if (!ticker.endsWith('.NS') && !ticker.endsWith('.BO') && !ticker.startsWith('^')) {
      ticker = `${ticker}.NS`;
    }
    
    onAddTicker(ticker);
    setSearchQuery('');
  };

  // Helper: Get Proximity Status for Nifty Range Screener
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
        distL,
        distH
      };
    } else if (distL <= proximityBuffer * 3.0) {
      return {
        text: '⏳ NEAR SUPPORT',
        bgColor: 'rgba(16, 185, 129, 0.08)',
        textColor: 'var(--color-green)',
        borderColor: 'rgba(16, 185, 129, 0.2)',
        distL,
        distH
      };
    } else if (price >= pHigh || Math.abs(distH) <= proximityBuffer) {
      return {
        text: '🔴 AT RESISTANCE (P HIGH)',
        bgColor: 'rgba(239, 68, 68, 0.15)',
        textColor: 'var(--color-red)',
        borderColor: 'rgba(239, 68, 68, 0.35)',
        distL,
        distH
      };
    } else if (distH <= proximityBuffer * 3.0) {
      return {
        text: '⏳ NEAR RESISTANCE',
        bgColor: 'rgba(239, 68, 68, 0.08)',
        textColor: 'var(--color-red)',
        borderColor: 'rgba(239, 68, 68, 0.2)',
        distL,
        distH
      };
    } else {
      return {
        text: '⚪ INSIDE RANGE',
        bgColor: 'rgba(255, 255, 255, 0.02)',
        textColor: 'var(--text-secondary)',
        borderColor: 'var(--border-glass)',
        distL,
        distH
      };
    }
  };

  // Filter items based on active tab and search query
  const getTabFilteredItems = () => {
    let filtered = [...items];
    if (activeTab === 'nifty') {
      if (selectedCapSize !== 'all') {
        filtered = filtered.filter(item => item.capSize === selectedCapSize);
      }
    } else if (activeTab === 'watchlist') {
      const customWatchlist = ['RAMCOSYS.NS', 'SPARC.NS', 'GENESYS.NS', 'LAXMIDNT.NS', 'TATAMOTORS.NS', 'VRLLOG.NS', 'RVNL.NS', 'JIOFIN.NS', 'IREDA.NS', 'HAL.NS', 'BEL.NS', 'ZOMATO.NS'];
      filtered = filtered.filter(item => customWatchlist.includes(item.ticker));
    } else {
      // Setup Screener shows setup scores for custom watchlist stocks
      const customWatchlist = ['RAMCOSYS.NS', 'SPARC.NS', 'GENESYS.NS', 'LAXMIDNT.NS', 'TATAMOTORS.NS', 'VRLLOG.NS', 'RELIANCE.NS', 'RVNL.NS', 'JIOFIN.NS', 'IREDA.NS', 'HAL.NS', 'BEL.NS', 'ZOMATO.NS', 'SBIN.NS', 'HDFCBANK.NS'];
      filtered = filtered.filter(item => customWatchlist.includes(item.ticker));
    }

    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filtered;
  };


  const currentTabItems = getTabFilteredItems();

  // Sort items based on active tab and selected sorting regime
  const sortedItems = [...currentTabItems].sort((a, b) => {
    if (activeTab === 'nifty') {
      // Sort Nifty stocks by absolute proximity to closest range edge (p low or p high)
      const getMinDist = (item: ScreenerItem) => {
        const vp = item.result.volumeProfile;
        const pLow = vp ? vp.lowestPrice : item.price;
        const pHigh = vp ? vp.highestPrice : item.price;
        const distL = Math.abs(((item.price - pLow) / pLow) * 100);
        const distH = Math.abs(((pHigh - item.price) / pHigh) * 100);
        return Math.min(distL, distH);
      };
      return getMinDist(a) - getMinDist(b);
    }
    
    if (sortBy === 'volume') {
      const rvolA = a.result.vdu.volumeSma20 > 0 ? (a.candles?.[a.candles.length - 1]?.volume || 0) / a.result.vdu.volumeSma20 : 0;
      const rvolB = b.result.vdu.volumeSma20 > 0 ? (b.candles?.[b.candles.length - 1]?.volume || 0) / b.result.vdu.volumeSma20 : 0;
      return rvolB - rvolA;
    }
    return b.result.metrics.setupScore - a.result.metrics.setupScore;
  });

  const filteredItems = sortedItems;


  return (
    <div className="glass-panel flex-column" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Header and Search */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-glass)' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Outfit', color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Flame size={20} className="glow-text-green" style={{ color: 'var(--color-green)' }} />
          NSE Explosive Scanner
        </h2>
        
        <form onSubmit={handleSubmitSearch} style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Search NSE stock (e.g. INFY, TATAMOTORS)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 38px',
              backgroundColor: 'rgba(6, 9, 19, 0.6)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              color: '#fff',
              outline: 'none',
              fontSize: '13px',
              transition: 'var(--transition-smooth)'
            }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(59, 130, 246, 0.4)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border-glass)')}
          />
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
        </form>

        {/* Sorting Controller */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={() => setSortBy('setup')}
            style={{
              flex: 1,
              padding: '6px 8px',
              backgroundColor: sortBy === 'setup' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${sortBy === 'setup' ? 'var(--color-green)' : 'var(--border-glass)'}`,
              borderRadius: '6px',
              color: sortBy === 'setup' ? 'var(--color-green)' : 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)',
              textAlign: 'center'
            }}
          >
            🎯 PAVP Swing
          </button>
          <button
            onClick={() => setSortBy('volume')}
            style={{
              flex: 1,
              padding: '6px 8px',
              backgroundColor: sortBy === 'volume' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.02)',
              border: `1px solid ${sortBy === 'volume' ? 'var(--color-gold)' : 'var(--border-glass)'}`,
              borderRadius: '6px',
              color: sortBy === 'volume' ? 'var(--color-gold)' : 'var(--text-secondary)',
              fontSize: '11px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)',
              textAlign: 'center'
            }}
          >
            ⚡ Volume Velocity
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          onClick={() => setActiveTab('screener')}
          style={{
            flex: 1.1,
            padding: '12px 0',
            background: 'none',
            border: 'none',
            color: activeTab === 'screener' ? 'var(--color-green)' : 'var(--text-muted)',
            fontWeight: '700',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            cursor: 'pointer',
            borderBottom: activeTab === 'screener' ? '2px solid var(--color-green)' : 'none',
            transition: 'var(--transition-smooth)'
          }}
        >
          PAVP Screener
        </button>
        <button
          onClick={() => setActiveTab('nifty')}
          style={{
            flex: 1.3,
            padding: '12px 0',
            background: 'none',
            border: 'none',
            color: activeTab === 'nifty' ? 'var(--color-cyan)' : 'var(--text-muted)',
            fontWeight: '700',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            cursor: 'pointer',
            borderBottom: activeTab === 'nifty' ? '2px solid var(--color-cyan)' : 'none',
            transition: 'var(--transition-smooth)'
          }}
        >
          Range Proximity
        </button>

        <button
          onClick={() => setActiveTab('watchlist')}
          style={{
            flex: 1,
            padding: '12px 0',
            background: 'none',
            border: 'none',
            color: activeTab === 'watchlist' ? 'var(--color-gold)' : 'var(--text-muted)',
            fontWeight: '700',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            cursor: 'pointer',
            borderBottom: activeTab === 'watchlist' ? '2px solid var(--color-gold)' : 'none',
            transition: 'var(--transition-smooth)'
          }}
        >
          Watchlist
        </button>
      </div>

      {/* Cap Size Pills (Only visible when Range Proximity Screener is active) */}
      {activeTab === 'nifty' && (
        <div style={{ display: 'flex', gap: '6px', padding: '12px 16px 6px 16px', flexWrap: 'wrap' }}>
          {(['all', 'large', 'mid', 'small'] as const).map(cap => {
            const isActive = selectedCapSize === cap;
            const label = 
              cap === 'all' ? 'All Caps' :
              cap === 'large' ? 'Large Cap' :
              cap === 'mid' ? 'Mid Cap' : 'Small Cap';
              
            const activeColor = 
              cap === 'all' ? 'var(--color-cyan)' :
              cap === 'large' ? 'var(--color-green)' :
              cap === 'mid' ? 'var(--color-gold)' : 'var(--color-purple)';

            const activeBg = 
              cap === 'all' ? 'rgba(6, 182, 212, 0.15)' :
              cap === 'large' ? 'rgba(16, 185, 129, 0.15)' :
              cap === 'mid' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(168, 85, 247, 0.15)';

            return (
              <button
                key={cap}
                onClick={() => setSelectedCapSize(cap)}
                style={{
                  padding: '4px 10px',
                  backgroundColor: isActive ? activeBg : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isActive ? activeColor : 'var(--border-glass)'}`,
                  borderRadius: '16px',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  fontSize: '10px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'var(--transition-smooth)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em'
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}



      {/* Stock List Panel */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--text-secondary)' }}>
            <Activity size={24} className="glow-text-blue" style={{ color: 'var(--color-blue)', animation: 'pulse-gold 1.5s infinite' }} />
            <span style={{ fontSize: '12px' }}>Calculating market indicators...</span>
          </div>
        )}

        {!isLoading && filteredItems.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>
            No stocks found in database.
          </div>
        )}

        {!isLoading && activeTab === 'nifty' && filteredItems.map((item) => {
          const { ticker, name, price, result } = item;
          const { text, bgColor, textColor, borderColor, distL, distH } = getProximityStatus(price, result);
          const isSelected = selectedTicker === ticker;

          return (
            <div
              key={ticker}
              onClick={() => onSelectTicker(ticker)}
              className="glass-panel glass-panel-hoverable"
              style={{
                padding: '12px',
                marginBottom: '10px',
                cursor: 'pointer',
                borderWidth: '1px',
                borderColor: isSelected ? 'var(--color-cyan)' : borderColor,
                boxShadow: isSelected ? 'var(--glow-blue)' : 'none',
                background: isSelected ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: '800', fontSize: '14px', letterSpacing: '0.02em', color: '#fff', display: 'block' }}>
                    {ticker.replace('.NS', '')}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </span>
                </div>

                <div style={{ marginRight: '16px', textAlign: 'right' }}>
                  <span style={{ fontWeight: '700', fontSize: '13px', color: '#fff', display: 'block' }}>
                    ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    L:{distL >= 0 ? '+' : ''}{distL.toFixed(1)}% | H:{distH >= 0 ? '+' : ''}{distH.toFixed(1)}%
                  </span>
                </div>

                <div
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    backgroundColor: bgColor,
                    border: `1px solid ${borderColor}`,
                    color: textColor,
                    fontSize: '10px',
                    fontWeight: '800',
                    textAlign: 'center',
                    minWidth: '115px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {text}
                </div>
              </div>
            </div>
          );
        })}

        {!isLoading && activeTab !== 'nifty' && filteredItems.map((item) => {
          const { ticker, name, price, change, result } = item;
          const { setupScore, setupRating, proximityToPLow, isLongTermUptrend } = result.metrics;
          const isSqueezed = result.squeeze.isSqueezed;
          const isVdu = result.vdu.isVolumeDriedUp;
          const isVolumeSpiked = result.vdu.isVolumeSpiked;
          
          const isSelected = selectedTicker === ticker;
          const ratingColor = 
            setupRating === 'A+' ? 'var(--color-green)' :
            setupRating === 'A' ? 'var(--color-cyan)' :
            setupRating === 'B' ? 'var(--color-gold)' : 'var(--text-muted)';
            
          const ratingGlow = 
            setupRating === 'A+' ? 'var(--glow-green)' :
            setupRating === 'A' ? 'var(--glow-blue)' :
            setupRating === 'B' ? 'var(--glow-gold)' : 'none';

          return (
            <div
              key={ticker}
              onClick={() => onSelectTicker(ticker)}
              className="glass-panel glass-panel-hoverable"
              style={{
                padding: '12px',
                marginBottom: '10px',
                cursor: 'pointer',
                borderWidth: isSelected ? '1px' : '1px',
                borderColor: isSelected ? 'var(--color-blue)' : 'var(--border-glass)',
                boxShadow: isSelected ? 'var(--glow-blue)' : 'none',
                background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-card)'
              }}
            >
              {/* Ticker & Core Price Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: '800', fontSize: '14px', letterSpacing: '0.02em', color: '#fff' }}>
                      {ticker.replace('.NS', '')}
                    </span>
                    {isLongTermUptrend && (
                      <span title="Uptrend Configured" style={{ display: 'flex', alignItems: 'center' }}>
                        <TrendingUp size={14} style={{ color: 'var(--color-green)' }} />
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: '#fff', display: 'block' }}>
                    ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: change >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                    {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Advanced Indicators & Score Row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.04)', paddingTop: '8px' }}>
                
                {/* Visual Signals */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {isSqueezed && (
                    <span className="badge badge-squeeze active" style={{ padding: '2px 6px', fontSize: '9px' }}>
                      Squeeze
                    </span>
                  )}
                  {isVdu && (
                    <span className="badge badge-vdu active" style={{ padding: '2px 6px', fontSize: '9px' }}>
                      VDU Dry
                    </span>
                  )}
                  {isVolumeSpiked && (
                    <span className="badge badge-spike active" style={{ padding: '2px 6px', fontSize: '9px' }}>
                      Spike ⚡
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    p low: <span style={{ color: proximityToPLow < 0 ? 'var(--color-red)' : (proximityToPLow <= 1.5 ? 'var(--color-green)' : 'var(--text-secondary)'), fontWeight: '700' }}>
                      {proximityToPLow >= 0 ? '+' : ''}{proximityToPLow.toFixed(1)}%
                    </span>
                  </span>
                </div>

                {/* Score Widget */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Score:</span>
                  <div
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: `1px solid ${ratingColor}`,
                      boxShadow: ratingGlow,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: '800', color: ratingColor }}>
                      {setupRating}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                      ({setupScore})
                    </span>
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
