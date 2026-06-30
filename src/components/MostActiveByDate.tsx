import React, { useMemo, useState } from 'react';
import { Calendar, ArrowUpDown, Loader2, AlertTriangle } from 'lucide-react';

interface ActiveStock {
  symbol: string;
  close: number;
  pctChg: number;
  volume: number;
  valueLakhs: number;
}

type SortKey = 'volume' | 'valueLakhs' | 'pctChg';
type SortOrder = 'desc' | 'asc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'volume', label: 'Volume (Shares)' },
  { key: 'valueLakhs', label: 'Value (Rs. Lakhs)' },
  { key: 'pctChg', label: '% Change' },
];

const TOP_N_OPTIONS = [10, 20, 50, 100];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const MostActiveByDate: React.FC = () => {
  const [date, setDate] = useState<string>(todayIso());
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [topN, setTopN] = useState<number>(20);

  const [stocks, setStocks] = useState<ActiveStock[]>([]);
  const [meta, setMeta] = useState<{ date: string; count: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!date) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/most-active?date=${date}`);
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error || `Request failed (HTTP ${res.status})`);
      }
      setStocks(body.stocks || []);
      setMeta({ date: body.date, count: body.count });
    } catch (err) {
      setStocks([]);
      setMeta(null);
      const message = err instanceof Error ? err.message : undefined;
      setError(
        message ||
          'Could not reach the most-active-stocks service. Make sure the site is deployed (firebase deploy) -- this feature needs the Cloud Function and will not work from `npm run dev` alone.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const sortedTop = useMemo(() => {
    const copy = [...stocks];
    copy.sort((a, b) => (sortOrder === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]));
    return copy.slice(0, topN);
  }, [stocks, sortKey, sortOrder, topN]);

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#fff', letterSpacing: '0.02em' }}>
            Most Active NSE Stocks <span style={{ color: 'var(--color-cyan)' }}>(By Date)</span>
          </h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Entire NSE market, ranked from the official end-of-day bhavcopy &mdash; not just your watchlist.
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Date picker */}
          <div style={{ position: 'relative' }}>
            <Calendar size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
            <input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              style={{
                padding: '8px 10px 8px 30px',
                backgroundColor: 'rgba(6, 9, 19, 0.6)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                color: '#fff',
                outline: 'none',
                fontSize: '12px',
              }}
            />
          </div>

          {/* Sort key */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={{
              padding: '8px 10px',
              backgroundColor: 'rgba(6, 9, 19, 0.6)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              color: '#fff',
              outline: 'none',
              fontSize: '12px',
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key} style={{ background: '#0b1120' }}>
                Sort: {opt.label}
              </option>
            ))}
          </select>

          {/* Order toggle */}
          <button
            onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            <ArrowUpDown size={13} />
            {sortOrder === 'desc' ? 'Highest first' : 'Lowest first'}
          </button>

          {/* Top N */}
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            style={{
              padding: '8px 10px',
              backgroundColor: 'rgba(6, 9, 19, 0.6)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              color: '#fff',
              outline: 'none',
              fontSize: '12px',
            }}
          >
            {TOP_N_OPTIONS.map((n) => (
              <option key={n} value={n} style={{ background: '#0b1120' }}>
                Top {n}
              </option>
            ))}
          </select>

          <button
            onClick={handleFetch}
            disabled={isLoading}
            style={{
              padding: '8px 18px',
              background: 'linear-gradient(135deg, var(--color-cyan) 0%, var(--color-blue) 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: '800',
              cursor: isLoading ? 'default' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isLoading && <Loader2 size={13} className="spin" style={{ animation: 'spin 1s linear infinite' }} />}
            {isLoading ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: 'var(--color-red)',
            fontSize: '12px',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Result meta */}
      {meta && !error && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {meta.count} EQ-series stocks traded on {meta.date}. Showing top {sortedTop.length}.
        </span>
      )}

      {/* Table */}
      {sortedTop.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(9, 13, 22, 0.4)', borderBottom: '1px solid var(--border-glass)' }}>
                <th style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rank</th>
                <th style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Symbol</th>
                <th style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Close</th>
                <th style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>% Chg</th>
                <th style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Volume</th>
                <th style={{ padding: '10px 16px', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Value (Lakhs)</th>
              </tr>
            </thead>
            <tbody>
              {sortedTop.map((s, i) => (
                <tr key={s.symbol} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', fontWeight: '700', color: '#fff' }}>{s.symbol}</td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {s.close.toFixed(2)}
                  </td>
                  <td
                    style={{
                      padding: '10px 16px',
                      fontSize: '12px',
                      textAlign: 'right',
                      fontWeight: '700',
                      color: s.pctChg >= 0 ? 'var(--color-green)' : 'var(--color-red)',
                    }}
                  >
                    {s.pctChg >= 0 ? '+' : ''}
                    {s.pctChg.toFixed(2)}%
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {s.volume.toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: '12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {s.valueLakhs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && sortedTop.length === 0 && (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Pick a date and click Fetch to see that day's most-active NSE stocks.
        </span>
      )}
    </div>
  );
};
