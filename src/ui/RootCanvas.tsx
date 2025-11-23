import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState, useRef, Component } from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';
import { detectTier, type Tier } from '../lib/graphics/tier';
import { AdaptivePerf } from './AdaptivePerf';
import { makeRenderer, type RendererType } from '../graphics/makeRenderer';
import { RendererInfo } from '../graphics/getRendererInfo';
import { MobilePerfScope } from '../perf/MobileGuard';
import { attachContextGuard } from '../perf/WebGLContextGuard';
import { installErrorProbe } from '../perf/ErrorProbe';
import { installDegradePolicy } from '../perf/FrameGovernor';
import { log, SAFE } from '../lib/debug';
import { MobileDiagnostics } from '../debug/mobileDiagnostics';

export type RootCanvasProps = Omit<CanvasProps, 'children' | 'gl' | 'dpr'> & {
  children: ReactNode | ((tier: Tier) => ReactNode);
  gl?: CanvasProps['gl'];
  onTierChange?: (tier: Tier) => void;
};

function Fallback({ reason }: { reason?: string }) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#dc2626',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 999999,
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ 
        background: 'rgba(0,0,0,0.2)', 
        padding: '30px', 
        borderRadius: '12px',
        maxWidth: '500px',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '15px' }}>
          🚨 3D Scene Crashed
        </h1>
        <p style={{ fontSize: '16px', marginBottom: '20px', lineHeight: '1.5' }}>
          The WebGL canvas failed to initialize or encountered a critical error.
        </p>
        {reason && (
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontFamily: 'monospace',
            fontSize: '12px',
            wordBreak: 'break-word',
            textAlign: 'left',
            maxHeight: '150px',
            overflow: 'auto'
          }}>
            {reason}
          </div>
        )}
        <button 
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            backgroundColor: 'white',
            color: '#dc2626',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'transform 0.2s'
          }}
          onClick={() => location.reload()}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

class CanvasErrorBoundary extends Component<any, { err?: any }> {
  state = { err: undefined };
  componentDidCatch(err: any, errorInfo: any) {
    this.setState({ err });
    console.error('🚨🚨🚨 CANVAS ERROR BOUNDARY TRIGGERED 🚨🚨🚨');
    console.error('Error:', err);
    console.error('Error message:', err?.message);
    console.error('Error stack:', err?.stack);
    console.error('Component stack:', errorInfo?.componentStack);
    log.err('CanvasErrorBoundary caught error', err);
    MobileDiagnostics.error('root-canvas', 'Canvas error boundary triggered', { 
      message: String(err?.message || err),
      stack: err?.stack,
      componentStack: errorInfo?.componentStack
    });
    
    alert(`CANVAS CRASH: ${err?.message || err}`);
  }
  render() {
    return this.state.err ? <Fallback reason={String(this.state.err)} /> : this.props.children;
  }
}

function CanvasWatchdog({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        log.err('Watchdog: canvas never mounted in 12s');
        MobileDiagnostics.error('watchdog', 'Canvas failed to mount within 12s');
        setOk(false);
      } else {
        log.info('Watchdog: canvas detected successfully');
        MobileDiagnostics.layout('watchdog', canvas);
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  if (!ok) return <Fallback reason="Canvas load timeout (12s watchdog)" />;
  return <>{children}</>;
}

export function RootCanvas({ children, gl: glProp, onTierChange, ...canvasProps }: RootCanvasProps) {
  const [tier, setTier] = useState<Tier | null>(null);
  const [rendererType, setRendererType] = useState<RendererType | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => installErrorProbe(), []);

  useEffect(() => {
    let cancelled = false;

    detectTier()
      .then((value) => {
        if (cancelled) return;
        setTier(value);
        onTierChange?.(value);
        MobileDiagnostics.log('tier', 'Tier detection resolved', { tier: value });
      })
      .catch(() => {
        if (cancelled) return;
        setTier('mobile-low');
        onTierChange?.('mobile-low');
        MobileDiagnostics.warn('tier', 'Tier detection failed, defaulting to mobile-low');
      });

    return () => {
      cancelled = true;
    };
  }, [onTierChange]);

  useEffect(() => {
    if (canvasRef.current) {
      return attachContextGuard(canvasRef.current);
    }
  }, []);

  const createRenderer = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!canvas) {
      log.err('Canvas element is null/undefined!');
      throw new Error('Canvas not ready');
    }

    log.info('Canvas element ready, creating renderer...');
    canvasRef.current = canvas;
    
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      log.warn('webglcontextlost event');
      MobileDiagnostics.warn('root-canvas', 'webglcontextlost');
    }, false);
    
    canvas.addEventListener('webglcontextrestored', () => {
      log.info('webglcontextrestored event');
      MobileDiagnostics.log('root-canvas', 'webglcontextrestored');
    }, false);

    if (typeof glProp === 'function') {
      return (glProp as (canvas: HTMLCanvasElement) => unknown)(canvas);
    }

    if (glProp) {
      return glProp as unknown;
    }

    if (!tier) {
      throw new Error('Tier not detected yet');
    }

    try {
      const result = await makeRenderer(canvas, tier);
      setRendererType(result.type);
      MobileDiagnostics.log('renderer', 'Renderer created', {
        type: result.type,
        tier,
      });
      
      const caps = result.renderer.capabilities as any;
      log.info('Renderer created', {
        type: result.type,
        tier,
        isWebGL2: caps.isWebGL2 ?? false,
        maxTextures: caps.maxTextures,
        maxTextureSize: caps.maxTextureSize,
        SAFE,
      });
      
      installDegradePolicy({
        setShadows: (v) => result.renderer.shadowMap.enabled = v,
        setBloom: (v) => log.info('[DegradePolicy] Bloom:', v),
        setAO: (v) => log.info('[DegradePolicy] AO:', v),
        setSSR: (v) => log.info('[DegradePolicy] SSR:', v),
        setSSGI: (v) => log.info('[DegradePolicy] SSGI:', v),
        setMaxAnisotropy: (n) => log.info('[DegradePolicy] Max Anisotropy:', n),
      });
      
      return result.renderer;
    } catch (err) {
      log.err('Renderer creation failed', err);
      MobileDiagnostics.error('renderer', 'Renderer creation failed', { message: String(err) });
      throw err;
    }
  }, [glProp, tier]);

  const resolvedChildren = useMemo(() => {
    if (!tier) return null;
    if (rendererType) {
      console.log(`🎨 RootCanvas rendering with ${rendererType.toUpperCase()} (tier: ${tier})`);
      MobileDiagnostics.log('renderer', 'Rendering with renderer', { rendererType, tier });
    }
    return typeof children === 'function' ? (children as (value: Tier) => ReactNode)(tier) : children;
  }, [children, tier, rendererType]);

  if (!tier) {
    return null;
  }

  const isMobile = typeof window !== 'undefined' && matchMedia('(max-width:768px)').matches;
  MobileDiagnostics.log('root-canvas', 'Render props resolved', {
    tier,
    rendererType,
    isMobile,
    frameloop: SAFE || isMobile ? 'demand' : canvasProps.frameloop || 'always',
  });
  
  return (
    <CanvasErrorBoundary>
      <CanvasWatchdog>
        <Canvas
          {...canvasProps}
          className="scene-canvas"
          gl={createRenderer}
          dpr={SAFE ? [1, 1] : (isMobile ? [1, 1.25] : [1, tier.startsWith('mobile') ? 1.0 : 2])}
          frameloop={SAFE || isMobile ? 'demand' : canvasProps.frameloop || 'always'}
          shadows={SAFE ? false : (canvasProps.shadows ?? (tier !== 'mobile-low'))}
        >
          <MobilePerfScope />
          <AdaptivePerf tier={tier} />
          <RendererInfo />
          {resolvedChildren}
        </Canvas>
      </CanvasWatchdog>
    </CanvasErrorBoundary>
  );
}
