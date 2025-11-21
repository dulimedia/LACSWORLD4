import { SoftShadows } from '@react-three/drei';
import type { Tier } from '../../lib/graphics/tier';

interface SoftShadowsControllerProps {
  tier: Tier;
}

export function SoftShadowsController({ tier }: SoftShadowsControllerProps) {

  return (
    <SoftShadows
      size={28}
      focus={0}
      samples={tier.startsWith('desktop') ? 17 : tier === 'mobile-high' ? 12 : 7}
    />
  );
}