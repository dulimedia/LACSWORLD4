import { useEffect, useRef } from 'react';
import { DirectionalLight, Scene } from 'three';
import { fitShadowCameraToScene } from './fitShadowCamera';
import { Environment } from '@react-three/drei';
import type { Tier } from '../../lib/graphics/tier';

interface AdaptiveLightingProps {
  scene: Scene;
  tier: Tier;
}

export function AdaptiveLighting({ scene, tier }: AdaptiveLightingProps) {
  const lightRef = useRef<DirectionalLight>(null);

  useEffect(() => {
    if (!lightRef.current) return;
    const light = lightRef.current;

    const res = tier.startsWith('desktop') ? 2048 : tier === 'mobile-high' ? 1536 : 1024;
    light.shadow.mapSize.width = res;
    light.shadow.mapSize.height = res;

    fitShadowCameraToScene(scene, light);
    light.shadow.map?.dispose();
    light.shadow.map = null as any;
    light.shadow.needsUpdate = true;
  }, [tier, scene]);

  return (
    <>
      <directionalLight
        ref={lightRef}
        castShadow
        position={[15, 30, 15]}
        intensity={2.5}
        color="#ffdcb4"
      />
      <ambientLight intensity={0.4} />
      <Environment
        files="/textures/kloofendal_48d_partly_cloudy_puresky_2k.hdr"
        background={false}
        preset={null as any}
      />
    </>
  );
}