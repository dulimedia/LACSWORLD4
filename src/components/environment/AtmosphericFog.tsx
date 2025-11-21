import { useThree } from '@react-three/fiber';
import { FogExp2 } from 'three';
import { useEffect } from 'react';

export function AtmosphericFog() {
  const { scene, gl } = useThree();

  useEffect(() => {
    scene.fog = new FogExp2(0xc0d6e8, 0.0008);
    gl.setClearColor(scene.fog.color);
  }, [scene, gl]);

  return null;
}