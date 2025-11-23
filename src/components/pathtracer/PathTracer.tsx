import { useEffect, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import type { Tier } from '../../lib/graphics/tier';

interface PathTracerProps {
  enabled: boolean;
  tier: Tier;
  samples?: number;
  bounces?: number;
  renderScale?: number;
  tiles?: { x: number; y: number };
}

export function PathTracer({
  enabled,
  tier,
  samples = 1,
  bounces = 5,
  renderScale = 1,
  tiles = { x: 2, y: 2 },
}: PathTracerProps) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  if (isMobile) {
    return null;
  }
  
  const { gl, scene, camera } = useThree();
  const pathTracerRef = useRef<WebGLPathTracer | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      if (pathTracerRef.current) {
        pathTracerRef.current.dispose();
        pathTracerRef.current = null;
      }
      setIsReady(false);
      return;
    }

    try {
      const pathTracer = new WebGLPathTracer(gl);
      pathTracer.tiles.set(tiles.x, tiles.y);
      pathTracer.renderScale = renderScale;
      pathTracer.bounces = bounces;
      pathTracer.filterGlossyFactor = 0.5;
      
      pathTracer.setScene(scene, camera);
      
      pathTracerRef.current = pathTracer;
      setIsReady(true);
      
      console.log('🎨 Path tracer initialized:', {
        bounces,
        renderScale,
        tiles,
      });
    } catch (error) {
      console.error('❌ Path tracer init failed:', error);
    }

    return () => {
      if (pathTracerRef.current) {
        pathTracerRef.current.dispose();
        pathTracerRef.current = null;
      }
    };
  }, [enabled, gl, scene, camera, bounces, renderScale, tiles.x, tiles.y]);

  useFrame(() => {
    if (!enabled || !isReady || !pathTracerRef.current) return;

    try {
      pathTracerRef.current.renderSample();
    } catch (error) {
      console.error('❌ Path tracer render error:', error);
    }
  });

  return null;
}
