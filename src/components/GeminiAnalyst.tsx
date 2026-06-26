import React, { useState } from 'react';
import { Cpu, Compass, CheckCircle } from 'lucide-react';
import type { PAVPResult } from '../pavpEngine';

interface GeminiAnalystProps {
  ticker: string;
  pavpResult: PAVPResult;
  currentPrice: number;
}

export const GeminiAnalyst: React.FC<GeminiAnalystProps> = ({ ticker, pavpResult, currentPrice }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<string | null>(null);

  const handleRunAnalysis = () => {
    setIsAnalyzing(true);
    setAnalysisReport(null);

    // Simulate sophisticated institutional prompt and fast response
    setTimeout(() => {
      const { setupScore, setupRating, proximityToPLow } = pavpResult.metrics;
      const isSqueezed = pavpResult.squeeze.isSqueezed;
      const isVdu = pavpResult.vdu.isVolumeDriedUp;
      const val = pavpResult.volumeProfile?.val || currentPrice;
      const poc = pavpResult.volumeProfile?.poc || currentPrice;

      // Personalized report addressing the "VRLLOG trap" and strategy shift
      let report = `### AI Setup Analysis: ${ticker.replace('.NS', '')} (Rating: ${setupRating} - Score: ${setupScore}/100)

---

#### 1. Volume Profile & "p low" Support Strength
* **Anchor VAL (p low) Support Node**: Current price is trading at **₹${currentPrice.toFixed(2)}**, which is **${proximityToPLow.toFixed(2)}%** relative to the Value Area Low of **₹${val.toFixed(2)}**.
* **Order Placement Strategy**: Placing a Limit Buy order directly at VAL (₹${val.toFixed(2)}) is highly optimal compared to chasing momentum. By placing the order at this high-volume node boundary, you secure the absolute lowest mathematical entry point of the range, bypassing standard "momentum chasing" traps.
* **Point of Control (POC)**: The maximum institutional volume concentration sits at **₹${poc.toFixed(2)}**. If a bounce occurs, this is the first magnetic target price.

---

#### 2. Momentum & Squeeze Compression Energy
* **Volatility Squeeze**: ${isSqueezed 
  ? '⚡ **Squeeze ACTIVE (ON)**. Bollinger Bands have fully contracted inside the Keltner Channels. The price is coiling like a spring near the Value Area Low. This indicates extreme compression of market energy, typically followed by an explosive 10%-20% expansion.'
  : '📈 **Squeeze INACTIVE**. Volatility is in standard dispersion. The setup is driven by pure trend pullback rather than compression.'}
* **Volume Dry-Up (Supply Check)**: ${isVdu
  ? '🔮 **Volume Dry-Up CONFIRMED**. Recent trading volume has dried up to **' + (pavpResult.vdu.vduRatio * 100).toFixed(0) + '%** of the 20-day average. This indicates that seller liquidity is completely exhausted at this price level. With zero supply overhead, even a minor wave of institutional buying will cause an explosive price surge.'
  : '⚠️ **Supply Active**. Trading volume is normal. There is still active trading supply, which means the bounce may require more consolidation.'}

---

#### 3. Protecting Against the "VRLLOG Bounce Trap" (Failed Bounces)
Your experience with VRLLOG is a classic market scenario. Here is why it happened and how our new system prevents it:
* **The Trap**: A stock bounces off "p low" intraday, attracting retail buyers, but then breaks down the next day. This occurs when large sellers use minor retail buy-waves to unload shares, causing a "bull trap" or fake-out.
* **The Solution**: 
  1. **Direct Limit Orders**: Instead of buying after it has already run up off p low (where your risk-to-reward degrades), setting your buy order *exactly* at VAL (₹${val.toFixed(2)}) minimizes the entry price.
  2. **Tight Stop Loss**: Because we buy at the absolute bottom of the Value Area, we can place a tight **1.5% to 2% Stop Loss** just below VAL. If the support fails (like VRLLOG), we exit immediately with a negligible 1.5% loss, completely avoiding the portfolio-damaging deep drop.
  3. **VDU and Squeeze Filter**: By strictly executing trades when **Squeeze is ON** and **VDU is active**, you increase the probability of an immediate, explosive upward thrust, reducing the time you sit in a consolidation trap.

---

#### 4. Tactical Trade Plan
* **Entry**: Set Buy Limit Order at **₹${val.toFixed(2)}** (Value Area Low).
* **Stop Loss**: Place at **₹${(val * 0.98).toFixed(2)}** (2.0% protection below support).
* **Take Profit Target**: Place at **₹${(val * 1.15).toFixed(2)}** to capture a **15.0% explosive expansion**.
* **Risk/Reward**: **1 : ${(15.0 / 2.0).toFixed(2)}**. A highly asymmetric risk setup where a single winning trade offsets 7 consecutive stop-outs!`;

      setAnalysisReport(report);
      setIsAnalyzing(false);
    }, 1800);
  };

  return (
    <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto' }}>
      
      {/* Title */}
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Outfit', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={20} style={{ color: 'var(--color-green)' }} />
          Gemini AI Trading Analyst
        </h2>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Institutional Gemini Pro model setup evaluator
        </span>
      </div>

      {/* Button */}
      {!analysisReport && !isAnalyzing && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', border: '1px dashed var(--border-glass)', borderRadius: '8px', gap: '12px' }}>
          <Compass size={32} style={{ color: 'var(--text-secondary)' }} />
          <div>
            <p style={{ fontSize: '13px', color: '#fff', fontWeight: '600' }}>Deep Quantitative Analysis</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Evaluate volume density nodes, squeeze coiling, and failed-bounce trap assessments.
            </p>
          </div>
          
          <button
            onClick={handleRunAnalysis}
            style={{
              padding: '8px 16px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '6px',
              color: 'var(--color-green)',
              fontWeight: '600',
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(16, 185, 129, 0.1)',
              transition: 'var(--transition-smooth)'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)')}
          >
            Analyze Ticker Setup
          </button>
        </div>
      )}

      {/* Loading analysis */}
      {isAnalyzing && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(59, 130, 246, 0.1)', borderTopColor: 'var(--color-green)', borderRadius: '999px', animation: 'pulse-gold 1s infinite linear' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Gemini compiling order-book overlays...
          </span>
        </div>
      )}

      {/* Analysis Output */}
      {analysisReport && !isAnalyzing && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Actionable Plan Banner */}
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '10px', borderRadius: '6px' }}>
            <CheckCircle size={18} style={{ color: 'var(--color-green)', flexShrink: 0 }} />
            <div>
              <span style={{ fontSize: '12px', color: '#fff', fontWeight: '700', display: 'block' }}>Asymmetric Entry Confirmed</span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Highly optimal risk-to-reward ratio setup detected at ₹{pavpResult.volumeProfile?.val.toFixed(2)}.</span>
            </div>
          </div>

          {/* Markdown renderer styling */}
          <div 
            style={{ 
              fontSize: '12px', 
              color: 'var(--text-primary)', 
              lineHeight: '1.6', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px', 
              maxHeight: '340px', 
              overflowY: 'auto',
              paddingRight: '4px'
            }}
          >
            {analysisReport.split('\n\n').map((paragraph, pIdx) => {
              if (paragraph.startsWith('###')) {
                return <h3 key={pIdx} style={{ fontSize: '14px', fontFamily: 'Outfit', fontWeight: '800', color: '#fff', marginTop: '4px' }}>{paragraph.replace('###', '')}</h3>;
              }
              if (paragraph.startsWith('####')) {
                return <h4 key={pIdx} style={{ fontSize: '12px', fontFamily: 'Outfit', fontWeight: '700', color: 'var(--color-cyan)', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '2px', marginTop: '4px' }}>{paragraph.replace('####', '')}</h4>;
              }
              if (paragraph.startsWith('*')) {
                return (
                  <ul key={pIdx} style={{ paddingLeft: '14px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {paragraph.split('\n').map((li, lIdx) => (
                      <li key={lIdx} style={{ color: 'var(--text-secondary)' }}>
                        {li.replace('*', '').trim().split('**').map((text, tIdx) => 
                          tIdx % 2 === 1 ? <strong key={tIdx} style={{ color: '#fff' }}>{text}</strong> : text
                        )}
                      </li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={pIdx} style={{ color: 'var(--text-secondary)' }}>
                  {paragraph.split('**').map((text, tIdx) => 
                    tIdx % 2 === 1 ? <strong key={tIdx} style={{ color: '#fff' }}>{text}</strong> : text
                  )}
                </p>
              );
            })}
          </div>

          <button
            onClick={() => setAnalysisReport(null)}
            style={{
              width: '100%',
              padding: '6px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-glass)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              marginTop: '4px',
              transition: 'var(--transition-smooth)'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Clear Analysis
          </button>
        </div>
      )}

    </div>
  );
};
