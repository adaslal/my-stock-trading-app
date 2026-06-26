import React, { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import type { PAVPResult, Candle } from '../pavpEngine';

interface TradingViewChartProps {
  candles: Candle[];
  pavpResult: PAVPResult;
  ticker: string;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({ candles, pavpResult, ticker }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candeSeriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // 1. Initialize Chart Container
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'rgba(13, 20, 38, 0.2)' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(59, 130, 246, 0.03)' },
        horzLines: { color: 'rgba(59, 130, 246, 0.03)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(59, 130, 246, 0.15)',
        visible: true,
      },
      timeScale: {
        borderColor: 'rgba(59, 130, 246, 0.15)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(168, 85, 247, 0.4)',
          width: 1,
          style: 3, // dashed
        },
        horzLine: {
          color: 'rgba(168, 85, 247, 0.4)',
          width: 1,
          style: 3, // dashed
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: 520,
    }) as any;

    chartRef.current = chart;

    // 2. Create Candlestick Series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    }) as any;
    candeSeriesRef.current = candlestickSeries;

    // Format candle times for Lightweight Charts
    const formattedData = candles.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candlestickSeries.setData(formattedData);

    // 3. Render EMA/SMA Trend Lines
    // 20 EMA
    const ema20Data: { time: any; value: number }[] = [];
    let prevEma20 = candles[0].close;
    const k20 = 2 / (20 + 1);
    candles.forEach((c, idx) => {
      const emaVal = idx === 0 ? c.close : c.close * k20 + prevEma20 * (1 - k20);
      prevEma20 = emaVal;
      if (idx >= 20) {
        ema20Data.push({ time: c.time as any, value: emaVal });
      }
    });
    const ema20Series = chart.addLineSeries({
      color: '#a855f7', // purple
      lineWidth: 1.5,
      title: '20 EMA',
    }) as any;
    ema20Series.setData(ema20Data);

    // 50 SMA
    const sma50Data: { time: any; value: number }[] = [];
    for (let i = 49; i < candles.length; i++) {
      const sum = candles.slice(i - 49, i + 1).reduce((acc, curr) => acc + curr.close, 0);
      sma50Data.push({ time: candles[i].time as any, value: sum / 50 });
    }
    const sma50Series = chart.addLineSeries({
      color: '#3b82f6', // blue
      lineWidth: 1.5,
      title: '50 SMA',
    }) as any;
    sma50Series.setData(sma50Data);

    // 200 SMA
    const sma200Data: { time: any; value: number }[] = [];
    for (let i = 199; i < candles.length; i++) {
      const sum = candles.slice(i - 199, i + 1).reduce((acc, curr) => acc + curr.close, 0);
      sma200Data.push({ time: candles[i].time as any, value: sum / 200 });
    }
    const sma200Series = chart.addLineSeries({
      color: '#10b981', // green
      lineWidth: 2,
      title: '200 SMA',
    }) as any;
    sma200Series.setData(sma200Data);

    // 4. Render Horizontal Price Levels (VAH, VAL, POC)
    const { volumeProfile } = pavpResult;
    const priceLines: any[] = [];

    if (volumeProfile) {
      // VAH price line
      const vahLine = candlestickSeries.createPriceLine({
        price: volumeProfile.vah,
        color: 'rgba(59, 130, 246, 0.8)',
        lineWidth: 1.5,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `VAH: ₹${volumeProfile.vah.toFixed(2)}`,
      });
      priceLines.push(vahLine);

      // VAL price line
      const valLine = candlestickSeries.createPriceLine({
        price: volumeProfile.val,
        color: 'rgba(59, 130, 246, 0.8)',
        lineWidth: 1.5,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `VAL: ₹${volumeProfile.val.toFixed(2)}`,
      });
      priceLines.push(valLine);

      // Profile Low ("p low") price line - bottom boundary of entire profile area
      const pLowLine = candlestickSeries.createPriceLine({
        price: volumeProfile.lowestPrice,
        color: 'rgba(16, 185, 129, 0.95)', // glowing emerald green
        lineWidth: 2,
        lineStyle: 0, // solid
        axisLabelVisible: true,
        title: `p low (Profile Low): ₹${volumeProfile.lowestPrice.toFixed(2)}`,
      });
      priceLines.push(pLowLine);

      // POC price line
      const pocLine = candlestickSeries.createPriceLine({
        price: volumeProfile.poc,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 0, // solid
        axisLabelVisible: true,
        title: `POC: ₹${volumeProfile.poc.toFixed(2)}`,
      });
      priceLines.push(pocLine);
    }

    // 5. confirmed Pivot Markers on candles
    const markers: any[] = [];
    const { pivots } = pavpResult;

    pivots.highs.forEach(ph => {
      markers.push({
        time: ph.time as any,
        position: 'aboveBar',
        color: '#ef4444',
        shape: 'arrowDown',
        text: `P High (₹${ph.price.toFixed(0)})`,
        size: 1.2
      });
    });

    pivots.lows.forEach(pl => {
      markers.push({
        time: pl.time as any,
        position: 'belowBar',
        color: '#10b981',
        shape: 'arrowUp',
        text: `P Low (₹${pl.price.toFixed(0)})`,
        size: 1.2
      });
    });

    // Sort markers by time (using string localeCompare for YYYY-MM-DD timestamps)
    markers.sort((a, b) => a.time.localeCompare(b.time));
    candlestickSeries.setMarkers(markers);

    // 6. Handle Chart Responsiveness
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    // Auto-fit contents
    chart.timeScale().fitContent();

    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, pavpResult]);

  // Volume Profile Visual Density Calculations
  const { volumeProfile } = pavpResult;
  const maxBinVolume = volumeProfile 
    ? Math.max(...volumeProfile.bins.map(b => b.volume)) 
    : 1;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 8px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '800', fontFamily: 'Outfit', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#fff' }}>{ticker.replace('.NS', '')}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>Daily Chart</span>
        </h3>
        
        {pavpResult.squeeze.isSqueezed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: 'var(--color-gold)', boxShadow: '0 0 10px var(--color-gold)', animation: 'pulse-gold 2s infinite ease-in-out' }} />
            <span style={{ fontSize: '11px', color: 'var(--color-gold)', fontWeight: '600' }}>IMPEDING BREAKOUT SQUEEZE ACTIVE</span>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', width: '100%', height: '520px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
        
        {/* Main Chart Container */}
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Side PAVP Volume Profile Overlay (Anchor Visual Bins) */}
        {volumeProfile && (
          <div 
            style={{
              position: 'absolute',
              top: '5px',
              left: '10px',
              bottom: '45px', // align above timeline
              width: '80px',
              display: 'flex',
              flexDirection: 'column-reverse', // matches lowest price to highest price scale
              pointerEvents: 'none', // click through to chart
              gap: '2px',
              zIndex: 5
            }}
          >
            {volumeProfile.bins.map((bin, idx) => {
              const widthPct = (bin.volume / maxBinVolume) * 100;
              const barBgColor = bin.isWithinValueArea 
                ? 'rgba(251, 192, 45, 0.28)' // Value area: Golden volume
                : 'rgba(59, 130, 246, 0.15)'; // Non-value area: Muted blue-grey volume
                
              const barBorderColor = bin.isWithinValueArea
                ? 'rgba(251, 192, 45, 0.4)'
                : 'rgba(59, 130, 246, 0.2)';

              return (
                <div 
                  key={idx}
                  style={{
                    flex: 1,
                    width: `${widthPct}%`,
                    minWidth: '2px',
                    background: barBgColor,
                    borderRight: `1px solid ${barBorderColor}`,
                    borderTop: `1px solid ${barBorderColor}`,
                    borderBottom: `1px solid ${barBorderColor}`,
                    borderRadius: '0 2px 2px 0',
                    transition: 'var(--transition-smooth)'
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Legend overlays */}
        <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(6, 9, 19, 0.75)', backdropFilter: 'blur(8px)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)', pointerEvents: 'none', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-secondary)' }}>
            <span style={{ width: '10px', height: '2px', background: '#a855f7' }} /> 20 EMA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-secondary)' }}>
            <span style={{ width: '10px', height: '2px', background: '#3b82f6' }} /> 50 SMA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-secondary)' }}>
            <span style={{ width: '10px', height: '2px', background: '#10b981' }} /> 200 SMA
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px', marginTop: '4px' }}>
            <span style={{ width: '8px', height: '8px', background: 'rgba(251, 192, 45, 0.45)', border: '1px solid #fbc02d', borderRadius: '1px' }} /> PAVP Value Area
          </div>
        </div>

      </div>
    </div>
  );
};
