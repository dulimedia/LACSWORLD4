import { useEffect, useState } from 'react';
import { usePerformanceMonitor } from '@react-three/drei';

export type Tier = 1 | 2 | 3; // 1 = mobile, 3 = beast PC

export function usePerformanceTier() {
  const [tier, setTier] = useState<Tier>(3);
  const [isMobile] = useState(() => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

  usePerformanceMonitor({
    onIncline: () => setTier(3),
    onDecline: () => setTier(isMobile ? 1 : 2),
    onFallback: () => setTier(1),
  });

  useEffect(() => {
    if (isMobile) setTier(1);
  }, [isMobile]);

  return tier;
}