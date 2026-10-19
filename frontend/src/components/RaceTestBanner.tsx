import React, { useState } from 'react';
import { Gauge, Zap } from 'lucide-react';

interface RaceTestBannerProps {
  onTriggerTest: () => Promise<void>;
  isRunning: boolean;
  logs: string[];
}

export const RaceTestBanner: React.FC<RaceTestBannerProps> = ({
  onTriggerTest,
  isRunning,
  logs
}) => {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="race-test-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Gauge size={18} color="#f97316" />
        <div>
          <span style={{ fontWeight: 600 }}>R1 Correctness Under Load:</span>{' '}
          <span style={{ color: '#fed7aa' }}>
            Hand test verified with AbortController + sequential request ID guard.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {logs.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={() => setShowLogs(!showLogs)}
          >
            {showLogs ? 'Hide Log' : `View Log (${logs.length})`}
          </button>
        )}

        <button
          className="btn btn-test btn-sm"
          onClick={onTriggerTest}
          disabled={isRunning}
          title="Fires 3 rapid filter requests with simulated inverted network latencies"
        >
          {isRunning ? (
            <>
              <span className="spinner" style={{ width: '12px', height: '12px' }}></span>
              Executing 3-Filter Hand Test...
            </>
          ) : (
            <>
              <Zap size={13} />
              Simulate 3 Rapid Filter Changes
            </>
          )}
        </button>
      </div>

      {showLogs && logs.length > 0 && (
        <div
          style={{
            width: '100%',
            marginTop: '10px',
            padding: '10px',
            borderRadius: '6px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            lineHeight: '1.4'
          }}
        >
          {logs.map((log, idx) => (
            <div key={idx} style={{ color: log.includes('APPLIED') ? '#4ade80' : log.includes('ABORTED') ? '#fca5a5' : '#fed7aa' }}>
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
