import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { PerfFlags } from './PerfFlags';
import { MobileDiagnostics } from '../debug/mobileDiagnostics';

export function useCanvasClamps() {
  const { gl, size, setDpr } = useThree();
  
  useEffect(() => {
    const maxCanvasPixels = PerfFlags.qualityTier === 'LOW' ? 0.9e6 : 
                           PerfFlags.qualityTier === 'BALANCED' ? 1.2e6 : 
                           3.0e6;
    
    const targetDpr = PerfFlags.DPR_MAX;
    setDpr(targetDpr);
    
    const pixels = size.width * size.height * targetDpr * targetDpr;
    MobileDiagnostics.log('canvas', 'Canvas metrics', {
      width: size.width,
      height: size.height,
      targetDpr,
      pixels: Math.round(pixels),
      maxCanvasPixels,
    });

    if (pixels > maxCanvasPixels) {
      const scale = Math.sqrt(maxCanvasPixels / (size.width * size.height));
      const clampedDpr = Math.max(0.75, Math.min(targetDpr * scale, targetDpr));
      MobileDiagnostics.warn('canvas', 'Clamping DPR', {
        previous: targetDpr,
        next: clampedDpr,
        pixels: Math.round(pixels),
      });
      setDpr(clampedDpr);
    }
  }, [gl, size, setDpr]);
}

export function useFrameGovernor() {
  const shedStep = useRef(0);
  
  useEffect(() => {
    if (!PerfFlags.isMobile) {
      MobileDiagnostics.log('frame', 'Skipping FrameGovernor on desktop');
      return;
    }
    
    let last = performance.now();
    let jankFrames = 0;
    let raf = 0;
    
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = now - last;
      last = now;
      
      if (dt > 50) {
        jankFrames++;
      }
      
      if (jankFrames >= 8 && shedStep.current < 3) {
        shedStep.current++;
        jankFrames = 0;
        MobileDiagnostics.warn('frame', 'Performance degradation detected', {
          dt,
          stage: shedStep.current,
        });
        const ev = new CustomEvent('perf:degrade', { detail: shedStep.current });
        window.dispatchEvent(ev);
      }
    };
    
    raf = requestAnimationFrame(loop);
    MobileDiagnostics.log('frame', 'Frame monitoring started');
    
    return () => {
      cancelAnimationFrame(raf);
      MobileDiagnostics.log('frame', 'Frame monitoring stopped');
    };
  }, []);
}

export function MobilePerfScope() {
  useCanvasClamps();
  useFrameGovernor();
  return null;
}
