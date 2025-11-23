export type Tier = 'desktop-webgpu' | 'desktop-webgl2' | 'mobile-high' | 'mobile-low';

export async function detectTier(): Promise<Tier> {
  if (typeof window === 'undefined') {
    return 'desktop-webgl2';
  }

  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const isMobile = !!nav && /Mobi|Android|iPhone|iPad/i.test(nav.userAgent);
  
  // CRITICAL FIX: Force mobile-low tier for ALL mobile devices to prevent memory crash
  // Mobile devices were loading desktop environment models (11.5MB) causing 45s crash
  if (isMobile) {
    console.log('🚨 MOBILE DETECTED - Forcing tier to mobile-low for stability');
    console.log('📱 User Agent:', nav?.userAgent);
    return 'mobile-low';
  }
  
  const hasWebGPU = !!(navigator as any).gpu;
  const canvas = document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
  const webgl2 = !!gl2;

  if (hasWebGPU) {
    console.log('🎨 Desktop tier: webgpu');
    return 'desktop-webgpu';
  }
  if (webgl2) {
    console.log('🎨 Desktop tier: webgl2');
    return 'desktop-webgl2';
  }
  
  console.log('🎨 Fallback tier: desktop-webgl2');
  return 'desktop-webgl2';
}
