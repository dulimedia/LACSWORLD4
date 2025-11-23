import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PerfFlags } from '../perf/PerfFlags';

export function FrustumCuller() {
  const { scene, camera } = useThree();
  const frustum = useRef(new THREE.Frustum());
  const projScreenMatrix = useRef(new THREE.Matrix4());
  const frameCounter = useRef(0);
  
  const isMobile = PerfFlags.isMobile;
  const checkInterval = isMobile ? 5 : 3; // Check every 5 frames on mobile, 3 on desktop
  
  useFrame(() => {
    frameCounter.current++;
    
    // Only check frustum every N frames (performance optimization)
    if (frameCounter.current % checkInterval !== 0) return;
    
    // Update frustum from camera
    projScreenMatrix.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.current.setFromProjectionMatrix(projScreenMatrix.current);
    
    let visibleCount = 0;
    let hiddenCount = 0;
    
    // Check all meshes in scene
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry) {
        // Compute bounding sphere if not already computed
        if (!object.geometry.boundingSphere) {
          object.geometry.computeBoundingSphere();
        }
        
        // Get world position for bounding sphere
        const sphere = object.geometry.boundingSphere;
        if (sphere) {
          const worldSphere = sphere.clone();
          worldSphere.applyMatrix4(object.matrixWorld);
          
          // Check if sphere intersects frustum
          const isVisible = frustum.current.intersectsSphere(worldSphere);
          
          // Only update visibility if changed (avoid unnecessary updates)
          if (object.visible !== isVisible) {
            object.visible = isVisible;
          }
          
          if (isVisible) {
            visibleCount++;
          } else {
            hiddenCount++;
          }
        }
      }
    });
    
    // Log culling stats occasionally (every 60 frames = ~1 second at 60fps)
    if (frameCounter.current % 60 === 0) {
      console.log(`🎯 Frustum culling: ${visibleCount} visible, ${hiddenCount} hidden`);
    }
  });
  
  return null;
}
