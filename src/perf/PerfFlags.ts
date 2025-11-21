import { pickTier, type QualityTier } from './QualityTier';
import { MobileDiagnostics } from '../debug/mobileDiagnostics';

export type Tier = "mobileLow" | "desktopHigh";

export const PerfFlags = (() => {
  const userAgent = navigator.userAgent;
  const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isNarrowViewport = window.innerWidth < 768;
  const hasLowMemory = (navigator as any).deviceMemory ? (navigator as any).deviceMemory <= 4 : false;
  const isSimulatorSize = window.innerWidth < 600 || window.innerHeight < 600;
  
  const isMobile = isMobileUA || (isTouchDevice && isNarrowViewport) || hasLowMemory || isSimulatorSize;
  const tier: Tier = (isMobile || isIOS) ? "mobileLow" : "desktopHigh";
  
  MobileDiagnostics.log('perf', 'PerfFlags initialized', {
    isIOS,
    isMobile,
    tier,
    userAgent: userAgent.substring(0, 80),
    isTouchDevice,
    isNarrowViewport,
    hasLowMemory,
    isSimulatorSize,
  });
  
  const qualityTier: QualityTier = pickTier();

  return {
    tier,
    qualityTier,
    isMobile,
    isMobileUA,
    isIOS,
    isTouch: isTouchDevice,
    
    DPR_MAX: qualityTier === 'LOW' ? 1.2 : qualityTier === 'BALANCED' ? 1.3 : 2.0,
    SHADOW_MAP_SIZE: qualityTier === 'LOW' ? 1024 : qualityTier === 'BALANCED' ? 2048 : 4096,
    SHADOWS_ENABLED: qualityTier !== 'LOW',
    MAX_TEXTURE_DIM: qualityTier === 'LOW' ? 1024 : qualityTier === 'BALANCED' ? 2048 : 4096,
    SHADOW_MAX_EXTENT: qualityTier === 'LOW' ? 100 : qualityTier === 'BALANCED' ? 180 : 210,
    SHADOW_MARGIN: qualityTier === 'LOW' ? 4 : qualityTier === 'BALANCED' ? 5.5 : 6,
    SHADOW_BIAS: qualityTier === 'LOW' ? -0.0005 : qualityTier === 'BALANCED' ? -0.002 : -0.006,
    SHADOW_NORMAL_BIAS: qualityTier === 'LOW' ? 0.15 : qualityTier === 'BALANCED' ? 0.3 : 0.35,
    
    dynamicShadows: false,
    ssr: false,
    ssgi: false,
    ao: qualityTier === 'HIGH',
    bloom: qualityTier !== 'LOW',
    antialiasing: false,
    anisotropy: qualityTier === 'LOW' ? 1 : 2,
    maxTextureSize: qualityTier === 'LOW' ? 1024 : qualityTier === 'BALANCED' ? 2048 : 4096,
    pixelRatio: qualityTier === 'LOW' ? 1.2 : qualityTier === 'BALANCED' ? 1.3 : 2.0,
    powerPreference: (isIOS ? 'low-power' : 'high-performance') as const,
    
    useLogDepth: false,
    originRebase: false,
    
    useDracoCompressed: false,
  };
})();
