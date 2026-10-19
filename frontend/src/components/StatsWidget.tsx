import React, { useState, useEffect, useRef } from 'react';
import type { StatsData } from '../types';
import { Activity, XCircle, RotateCcw, AlertTriangle, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface StatsWidgetProps {
  token: string | null;
}

export const StatsWidget: React.FC<StatsWidgetProps> = ({ token }) => {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retried, setRetried] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [simulatedError, setSimulatedError] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchStats = (isRetry = false) => {
    // Cancel any existing in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    if (isRetry) {
      setRetried(true);
    }

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // If simulated error is enabled, hit an invalid endpoint or fail
    const url = simulatedError ? '/api/orders/stats-error-sim' : '/api/orders/stats';

    fetch(url, {
      signal: controller.signal,
      headers
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Stats API failed with HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data: StatsData) => {
        setStats(data);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          console.log('[StatsWidget] Request intentionally aborted.');
          setLoading(false);
          return;
        }
        setError(err.message || 'Failed to load stats');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStats();
    return () => {
      // Automatically cancel request when component unmounts or user navigates
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [simulatedError]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      setError('Request cancelled by user.');
    }
  };

  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: isOpen ? '1px solid var(--border-subtle)' : 'none',
          background: 'rgba(15, 23, 42, 0.4)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={18} color="#818cf8" />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            Live Analytics & Revenue (O1: Slow API Demo)
          </span>
          {loading && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#a5b4fc' }}>
              <span className="spinner" style={{ width: '12px', height: '12px' }}></span>
              Slow API computing (3.5s)...
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {loading && (
            <button className="btn btn-secondary btn-sm" onClick={handleCancel} title="Abort in-flight request">
              <XCircle size={14} color="#f87171" />
              Cancel Request
            </button>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={simulatedError}
              onChange={(e) => {
                setSimulatedError(e.target.checked);
                setRetried(false);
              }}
            />
            Simulate 500 Error
          </label>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setIsOpen(!isOpen)}
            style={{ padding: '4px 10px' }}
          >
            {isOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: '16px 20px' }}>
          {error ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#ef4444" />
                <span><strong>Error:</strong> {error}</span>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => fetchStats(true)}
                disabled={loading || retried}
                style={{ background: '#ef4444' }}
              >
                <RotateCcw size={14} />
                {retried ? 'Retried Once (Limit Reached)' : 'Retry (1 allowed)'}
              </button>
            </div>
          ) : loading && !stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{
                    height: '75px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-subtle)',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}
                />
              ))}
            </div>
          ) : stats ? (
            <div className="stats-banner">
              <div className="stat-item">
                <span className="stat-label">Total Database Orders</span>
                <span className="stat-value">{stats.totalOrders.toLocaleString()}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Over 50,000 indexed</span>
              </div>

              <div className="stat-item">
                <span className="stat-label">Past 24h Revenue</span>
                <span className="stat-value" style={{ color: '#34d399' }}>
                  ${stats.todayRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {stats.todayOrdersCount} orders placed today
                </span>
              </div>

              <div className="stat-item">
                <span className="stat-label">Pending</span>
                <span className="stat-value" style={{ color: '#fbbf24' }}>
                  {stats.statusCounts.pending.toLocaleString()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#fbbf24' }}>
                  <Clock size={12} /> Awaiting action
                </span>
              </div>

              <div className="stat-item">
                <span className="stat-label">Processing</span>
                <span className="stat-value" style={{ color: '#38bdf8' }}>
                  {stats.statusCounts.processing.toLocaleString()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#38bdf8' }}>
                  <AlertCircle size={12} /> In fulfillment
                </span>
              </div>

              <div className="stat-item">
                <span className="stat-label">Completed</span>
                <span className="stat-value" style={{ color: '#34d399' }}>
                  {stats.statusCounts.completed.toLocaleString()}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#34d399' }}>
                  <CheckCircle2 size={12} /> Dispatched
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
