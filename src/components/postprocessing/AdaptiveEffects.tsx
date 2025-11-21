import { EffectComposer, Bloom, Noise } from '@react-three/postprocessing';
import type { Tier } from '../../lib/graphics/tier';

interface AdaptiveEffectsProps {
  tier: Tier;
}

export function AdaptiveEffects({ tier }: AdaptiveEffectsProps) {
  if (tier === 'mobile-low') {
    return (
      <EffectComposer>
        <Noise opacity={0.015} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer>
      <Bloom
        intensity={tier.startsWith('desktop') ? 0.6 : 0.35}
        luminanceThreshold={0.7}
        mipmapBlur
      />
      <Noise opacity={0.02} />
    </EffectComposer>
  );
}