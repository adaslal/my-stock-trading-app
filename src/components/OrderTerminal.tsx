import React, { useState, useEffect } from 'react';
import { Shield, Plus, AlertTriangle } from 'lucide-react';
import type { PAVPResult } from '../pavpEngine';

interface OrderTerminalProps {
  ticker: string;
  pavpResult: PAVPResult;
  currentPrice: number;
  onDeployOrder: (order: {
    ticker: string;
    entry: number;
    stopLoss: number;
    target: number;
    quantity: number;
    totalCost: number;
    riskReward: number;
  }) => void;
}

export const OrderTerminal: React.FC<OrderTerminalProps> = ({
  ticker,
  pavpResult,
  currentPrice,
  onDeployOrder
}) => {
  const { volumeProfile } = pavpResult;
  const pLowPrice = volumeProfile ? volumeProfile.lowestPrice : currentPrice;
  const valPrice = volumeProfile ? volumeProfile.val : currentPrice;
  const vahPrice = volumeProfile ? volumeProfile.vah : currentPrice * 1.15;

  // State inputs
  const [strategyProfile, setStrategyProfile] = useState<'swing' | 'scalp'>('swing');
  const [riskCapital, setRiskCapital] = useState<number>(100000); // 1 Lakh default capital
  const [riskPerTrade, setRiskPerTrade] = useState<number>(2000); // Risk 2000 per trade default
  const [entryPrice, setEntryPrice] = useState<number>(pLowPrice); // Default limit entry at Profile Low!
  const [stopLossPercent, setStopLossPercent] = useState<number>(2.0); // Default 2% Stop Loss below p low
  const [targetType, setTargetType] = useState<'fixed' | 'vah'>('fixed');
  const [targetPercent, setTargetPercent] = useState<number>(15.0); // Default 15% target for explosive moves

  // Automatically update prices when ticker, strategy profile, or current price changes
  useEffect(() => {
    if (strategyProfile === 'scalp') {
      setEntryPrice(currentPrice);
      setStopLossPercent(0.5);
      setTargetPercent(1.0);
    } else {
      setEntryPrice(pLowPrice);
      setStopLossPercent(2.0);
      setTargetPercent(15.0);
    }
  }, [ticker, pLowPrice, currentPrice, strategyProfile]);

  // Derived Calculations
  const entry = Number(entryPrice);
  const stopLoss = entry * (1 - Number(stopLossPercent) / 100);
  
  const target = targetType === 'vah' 
    ? vahPrice 
    : entry * (1 + Number(targetPercent) / 100);

  const riskPerShare = Math.max(entry - stopLoss, 0.01);
  const rewardPerShare = Math.max(target - entry, 0.01);

  // Position sizing (Quantity) = Risk Per Trade / Risk Per Share
  const quantity = Math.floor(riskPerTrade / riskPerShare);
  const totalCost = quantity * entry;
  const riskRewardRatio = rewardPerShare / riskPerShare;

  const handleSetEntryToPLow = () => {
    setEntryPrice(pLowPrice);
  };

  const handleSetEntryToVal = () => {
    setEntryPrice(valPrice);
  };

  const handleSetEntryToPoc = () => {
    if (volumeProfile) setEntryPrice(volumeProfile.poc);
  };

  const handleDeploy = () => {
    if (quantity <= 0) return;
    onDeployOrder({
      ticker,
      entry,
      stopLoss,
      target,
      quantity,
      totalCost,
      riskReward: riskRewardRatio
    });
  };

  return (
    <div className="glass-panel flex-column" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
      
      {/* Title */}
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: '800', fontFamily: 'Outfit', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={20} style={{ color: 'var(--color-blue)' }} />
          Limit order & Risk Terminal
        </h2>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Set limit orders at mathematical value area nodes
        </span>
      </div>

      {/* Strategy Profile Switcher */}
      <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
        <button
          onClick={() => setStrategyProfile('swing')}
          style={{
            flex: 1,
            padding: '6px',
            backgroundColor: strategyProfile === 'swing' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: strategyProfile === 'swing' ? '1px solid var(--color-blue)' : 'none',
            borderRadius: '6px',
            color: strategyProfile === 'swing' ? '#fff' : 'var(--text-secondary)',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'var(--transition-smooth)'
          }}
        >
          📈 Swing Setup
        </button>
        <button
          onClick={() => setStrategyProfile('scalp')}
          style={{
            flex: 1,
            padding: '6px',
            backgroundColor: strategyProfile === 'scalp' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
            border: strategyProfile === 'scalp' ? '1px solid var(--color-gold)' : 'none',
            borderRadius: '6px',
            color: strategyProfile === 'scalp' ? '#fff' : 'var(--text-secondary)',
            fontSize: '11px',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'var(--transition-smooth)'
          }}
        >
          ⚡ 5-Min Scalp
        </button>
      </div>

      {/* Capital Management */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(0, 0, 0, 0.25)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
        <div>
          <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Trading Capital</label>
          <input
            type="number"
            value={riskCapital}
            onChange={(e) => setRiskCapital(Math.max(0, Number(e.target.value)))}
            style={{ width: '100%', padding: '6px 8px', background: 'rgba(6, 9, 19, 0.8)', border: '1px solid var(--border-glass)', borderRadius: '4px', color: '#fff', fontSize: '12px', outline: 'none' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Max Risk Per Trade</label>
          <input
            type="number"
            value={riskPerTrade}
            onChange={(e) => setRiskPerTrade(Math.max(0, Number(e.target.value)))}
            style={{ width: '100%', padding: '6px 8px', background: 'rgba(6, 9, 19, 0.8)', border: '1px solid var(--border-glass)', borderRadius: '4px', color: '#fff', fontSize: '12px', outline: 'none' }}
          />
        </div>
      </div>

      {/* Order Entry */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        
        {/* Entry Price */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>Limit Entry Price</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button 
                onClick={handleSetEntryToPLow}
                style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid var(--color-green)', color: 'var(--color-green)', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                p low (Floor)
              </button>
              <button 
                onClick={handleSetEntryToVal}
                style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--color-blue)', borderRadius: '3px', cursor: 'pointer' }}
              >
                VAL
              </button>
              <button 
                onClick={handleSetEntryToPoc}
                style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--color-red)', borderRadius: '3px', cursor: 'pointer' }}
              >
                POC
              </button>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '8px', top: '7px', fontSize: '12px', color: 'var(--text-muted)' }}>₹</span>
            <input
              type="number"
              step="0.05"
              value={entryPrice}
              onChange={(e) => setEntryPrice(Number(e.target.value))}
              style={{ width: '100%', padding: '6px 8px 6px 20px', background: 'rgba(6, 9, 19, 0.8)', border: '1px solid var(--border-glass)', borderRadius: '4px', color: '#fff', fontSize: '13px', outline: 'none' }}
            />
          </div>
        </div>

        {/* Stop Loss Config */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Stop Loss (below entry)</label>
            <span style={{ fontSize: '11px', color: 'var(--color-red)', fontWeight: '600' }}>₹{stopLoss.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="range"
              min={strategyProfile === 'scalp' ? '0.1' : '0.5'}
              max={strategyProfile === 'scalp' ? '2.0' : '5.0'}
              step={strategyProfile === 'scalp' ? '0.05' : '0.1'}
              value={stopLossPercent}
              onChange={(e) => setStopLossPercent(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--color-red)' }}
            />
            <span style={{ fontSize: '12px', color: '#fff', minWidth: '40px', textAlign: 'right' }}>{stopLossPercent}%</span>
          </div>
        </div>

        {/* Target Config */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Take Profit Target</label>
            <span style={{ fontSize: '11px', color: 'var(--color-green)', fontWeight: '600' }}>₹{target.toFixed(2)}</span>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              onClick={() => setTargetType('fixed')}
              style={{ flex: 1, padding: '4px', fontSize: '10px', background: targetType === 'fixed' ? 'rgba(59, 130, 246, 0.2)' : 'none', border: '1px solid var(--border-glass)', color: targetType === 'fixed' ? '#fff' : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer' }}
            >
              Explosive (%)
            </button>
            <button
              onClick={() => setTargetType('vah')}
              style={{ flex: 1, padding: '4px', fontSize: '10px', background: targetType === 'vah' ? 'rgba(59, 130, 246, 0.2)' : 'none', border: '1px solid var(--border-glass)', color: targetType === 'vah' ? '#fff' : 'var(--text-muted)', borderRadius: '4px', cursor: 'pointer' }}
            >
              PAVP VAH (Profile High)
            </button>
          </div>

          {targetType === 'fixed' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="range"
                min={strategyProfile === 'scalp' ? '0.2' : '5.0'}
                max={strategyProfile === 'scalp' ? '5.0' : '30.0'}
                step={strategyProfile === 'scalp' ? '0.1' : '0.5'}
                value={targetPercent}
                onChange={(e) => setTargetPercent(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--color-green)' }}
              />
              <span style={{ fontSize: '12px', color: '#fff', minWidth: '40px', textAlign: 'right' }}>{targetPercent}%</span>
            </div>
          )}
        </div>

      </div>

      {/* Position Calculations Details */}
      <div style={{ flex: 1, background: 'rgba(6, 9, 19, 0.45)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h4 style={{ fontSize: '11px', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '4px' }}>Position Calculations</h4>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Calculated Quantity:</span>
          <span style={{ color: '#fff', fontWeight: '700' }}>{quantity} Shares</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total Capital Required:</span>
          <span style={{ color: totalCost > riskCapital ? 'var(--color-red)' : '#fff', fontWeight: '700' }}>
            ₹{totalCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Risk-to-Reward Ratio:</span>
          <span style={{ color: riskRewardRatio >= 3.0 ? 'var(--color-green)' : 'var(--color-gold)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
            1 : {riskRewardRatio.toFixed(2)}
          </span>
        </div>

        {totalCost > riskCapital && (
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '6px', borderRadius: '4px', marginTop: '4px' }}>
            <AlertTriangle size={14} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
            <span style={{ fontSize: '9px', color: 'var(--color-red)' }}>Cost exceeds total capital! Reduce risk size or expand capital.</span>
          </div>
        )}
      </div>

      {/* Deploy Alert Button */}
      <button
        onClick={handleDeploy}
        disabled={quantity <= 0 || totalCost > riskCapital}
        style={{
          width: '100%',
          padding: '12px',
          background: 'linear-gradient(135deg, var(--color-blue) 0%, #1e40af 100%)',
          boxShadow: 'var(--glow-blue)',
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          fontWeight: '700',
          cursor: quantity <= 0 || totalCost > riskCapital ? 'not-allowed' : 'pointer',
          opacity: quantity <= 0 || totalCost > riskCapital ? 0.4 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          fontSize: '13px',
          transition: 'var(--transition-smooth)'
        }}
      >
        <Plus size={16} />
        {strategyProfile === 'scalp' ? 'Deploy 5-Min Scalping Alert' : 'Set Limit Order Alert'}
      </button>

    </div>
  );
};
