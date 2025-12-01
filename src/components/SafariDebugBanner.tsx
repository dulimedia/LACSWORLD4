import { useEffect, useState } from 'react';
import { getSafariDebugLines } from '../debug/safariLogger';
import { PerfFlags } from '../perf/PerfFlags';

export function SafariDebugBanner() {
  const [lines, setLines] = useState<string[]>([]);
  const [minimized, setMinimized] = useState(false);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setLines(getSafariDebugLines());
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  const params = new URLSearchParams(window.location.search);
  const debugEnabled = params.get('debugSafari') === '1';
  
  if (!PerfFlags.isIOS || !debugEnabled) return null;
  
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  const isFirefox = /FxiOS/.test(navigator.userAgent);
  const isOrion = /Orion/.test(navigator.userAgent);
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: minimized ? '30px' : '40vh',
      overflow: 'auto',
      fontSize: 10,
      fontFamily: 'monospace',
      background: 'rgba(0,0,0,0.9)',
      color: '#0f0',
      zIndex: 99999,
      pointerEvents: 'auto',
      border: '2px solid #0f0',
      borderBottom: 'none',
    }}>
      <div style={{
        position: 'sticky',
        top: 0,
        background: 'rgba(0,0,0,0.95)',
        padding: '5px',
        borderBottom: '1px solid #0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontWeight: 'bold', color: '#fff' }}>🍎 SAFARI DEBUG BANNER</div>
        <button
          onClick={() => setMinimized(!minimized)}
          style={{
            background: '#0f0',
            color: '#000',
            border: 'none',
            padding: '3px 8px',
            borderRadius: '3px',
            fontSize: 10,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {minimized ? 'EXPAND' : 'MINIMIZE'}
        </button>
      </div>
      
      {!minimized && (
        <>
          <div style={{ padding: '5px', borderBottom: '1px solid #333' }}>
            <div style={{ color: '#ff0' }}>UA: {navigator.userAgent}</div>
          </div>
          
          <div style={{ padding: '5px', borderBottom: '1px solid #333', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
            <div>isIOS: <span style={{ color: isIOS ? '#0f0' : '#f00' }}>{String(isIOS)}</span></div>
            <div>isSafari: <span style={{ color: isSafari ? '#0f0' : '#f00' }}>{String(isSafari)}</span></div>
            <div>isFirefox: <span style={{ color: isFirefox ? '#0f0' : '#f00' }}>{String(isFirefox)}</span></div>
            <div>isOrion: <span style={{ color: isOrion ? '#0f0' : '#f00' }}>{String(isOrion)}</span></div>
            <div>Tier: <span style={{ color: '#0ff' }}>{PerfFlags.tier}</span></div>
            <div>DPR: <span style={{ color: '#0ff' }}>{PerfFlags.DPR_MAX}</span></div>
          </div>
          
          <div style={{ padding: '5px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#fff' }}>
              DEBUG LOG ({lines.length} lines):
            </div>
            {lines.length === 0 ? (
              <div style={{ color: '#888', fontStyle: 'italic' }}>No logs yet...</div>
            ) : (
              lines.map((line, i) => (
                <div key={i} style={{ 
                  padding: '2px 0',
                  color: line.includes('ERROR') ? '#f00' : 
                         line.includes('✅') ? '#0f0' : 
                         line.includes('⚠️') ? '#ff0' : '#0f0'
                }}>
                  {line}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
