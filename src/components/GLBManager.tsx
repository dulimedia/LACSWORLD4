/** Spec reference:
 * See ./docs/AGENT_SPEC.md (§10 Acceptance) and ./docs/INTERACTION_CONTRACT.md (§3-4).
 * Do not change ids/schema without updating docs.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLBState, type GLBNodeInfo } from '../store/glbState';
import { useExploreState } from '../store/exploreState';
import { useFilterStore } from '../stores/useFilterStore';
import { SELECTED_MATERIAL_CONFIG, HOVERED_MATERIAL_CONFIG, FILTER_HIGHLIGHT_CONFIG } from '../config/ghostMaterialConfig';
import { logger } from '../utils/logger';
import { PerfFlags } from '../perf/PerfFlags';
import { MobileDiagnostics } from '../debug/mobileDiagnostics';

interface GLBUnitProps {
  node: GLBNodeInfo;
}

const FADE_DURATION = 0.8;

const GLBUnit: React.FC<GLBUnitProps> = ({ node }) => {
  let scene, error;
  
  try {
    const result = useGLTF(node.path);
    scene = result.scene;
    error = result.error;
  } catch (loadError) {
    console.error('🚨 useGLTF crash for:', node.path, loadError);
    MobileDiagnostics.error('glb', 'useGLTF crashed', { key: node.key, path: node.path, error: loadError });
    return null;
  }
  
  const groupRef = useRef<THREE.Group>(null);
  const originalMaterialsRef = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());
  const fadeProgressRef = useRef(0);
  const targetStateRef = useRef<'none' | 'selected' | 'hovered' | 'filtered'>('none');
  
  const selectedMaterialRef = useRef<THREE.MeshStandardMaterial>();
  const hoveredMaterialsRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  const filteredMaterialRef = useRef<THREE.MeshStandardMaterial>();
  
  const { selectedUnit, selectedBuilding, selectedFloor, hoveredUnit } = useGLBState();
  const { selectedUnitKey, hoveredUnitKey } = useExploreState();
  const { isUnitActive } = useFilterStore();
  
  // Handle GLB loading errors gracefully
  if (error) {
    logger.warn('GLB', '⚠️', `Failed to load GLB: ${node.key}`);
    MobileDiagnostics.error('glb', 'Failed to load GLB', { key: node.key, path: node.path });
    return null;
  }

  // Store original materials on first load
  useEffect(() => {
    if (scene && originalMaterialsRef.current.size === 0) {
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          originalMaterialsRef.current.set(child.uuid, child.material);
        }
      });
      MobileDiagnostics.log('glb', 'Cached original materials', {
        node: node.key,
        meshCount: originalMaterialsRef.current.size,
      });
    }
  }, [scene, node.key]);
  
  const { selectUnit, updateGLBObject } = useGLBState();
  const { setSelected } = useExploreState();
  
  // Update the GLB state store with the loaded object
  useEffect(() => {
    if (groupRef.current && !node.isLoaded) {
      updateGLBObject(node.key, groupRef.current);
      MobileDiagnostics.log('glb', 'Registered GLB group', { node: node.key });
    }
  }, [node.key, node.isLoaded, updateGLBObject]);

  // Determine if this unit is selected, hovered, or filtered
  const isHovered = hoveredUnit === node.key && !selectedUnit;
  const isSelected = selectedUnit === node.unitName && 
                    selectedBuilding === node.building && 
                    selectedFloor === node.floor;
  const isFiltered = isUnitActive(node.key) && !isSelected && !isHovered;

  // Update target state when selection/hover/filter changes
  useEffect(() => {
    if (isSelected) {
      targetStateRef.current = 'selected';
    } else if (isHovered) {
      targetStateRef.current = 'hovered';
    } else if (isFiltered) {
      targetStateRef.current = 'filtered';
    } else {
      targetStateRef.current = 'none';
    }
  }, [isSelected, isHovered, isFiltered]);

  // Animate fade in/out with useFrame
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const targetProgress = targetStateRef.current !== 'none' ? 1 : 0;
    const fadeSpeed = 1 / FADE_DURATION;
    
    if (fadeProgressRef.current !== targetProgress) {
      if (fadeProgressRef.current < targetProgress) {
        fadeProgressRef.current = Math.min(1, fadeProgressRef.current + delta * fadeSpeed);
      } else {
        fadeProgressRef.current = Math.max(0, fadeProgressRef.current - delta * fadeSpeed);
      }

      groupRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const originalMaterial = originalMaterialsRef.current.get(child.uuid);
          
          if (targetStateRef.current === 'selected') {
            if (!selectedMaterialRef.current) {
              selectedMaterialRef.current = new THREE.MeshStandardMaterial({
                color: SELECTED_MATERIAL_CONFIG.color,
                emissive: SELECTED_MATERIAL_CONFIG.emissive,
                emissiveIntensity: 0,
                metalness: SELECTED_MATERIAL_CONFIG.metalness,
                roughness: SELECTED_MATERIAL_CONFIG.roughness,
                transparent: true,
                opacity: 0,
              });
            }
            if (!child.material || !(child.material as any).__isAnimatedMaterial) {
              (selectedMaterialRef.current as any).__isAnimatedMaterial = true;
              child.material = selectedMaterialRef.current;
            }
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.opacity = fadeProgressRef.current;
            mat.emissiveIntensity = SELECTED_MATERIAL_CONFIG.emissiveIntensity * fadeProgressRef.current;
            child.visible = true;
          } else if (targetStateRef.current === 'hovered') {
            if (originalMaterial && (!child.material || !(child.material as any).__isAnimatedMaterial)) {
              if (!hoveredMaterialsRef.current.has(child.uuid)) {
                const hoveredMaterial = (originalMaterial as THREE.MeshStandardMaterial).clone();
                hoveredMaterial.emissive = new THREE.Color(HOVERED_MATERIAL_CONFIG.emissive);
                hoveredMaterial.emissiveIntensity = 0;
                hoveredMaterialsRef.current.set(child.uuid, hoveredMaterial);
              }
              const hoveredMat = hoveredMaterialsRef.current.get(child.uuid)!;
              (hoveredMat as any).__isAnimatedMaterial = true;
              child.material = hoveredMat;
            }
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = HOVERED_MATERIAL_CONFIG.emissiveIntensity * fadeProgressRef.current;
            child.visible = true;
          } else if (targetStateRef.current === 'filtered') {
            if (!filteredMaterialRef.current) {
              filteredMaterialRef.current = new THREE.MeshStandardMaterial({
                color: FILTER_HIGHLIGHT_CONFIG.color,
                emissive: FILTER_HIGHLIGHT_CONFIG.emissive,
                emissiveIntensity: 0,
                metalness: FILTER_HIGHLIGHT_CONFIG.metalness,
                roughness: FILTER_HIGHLIGHT_CONFIG.roughness,
                transparent: FILTER_HIGHLIGHT_CONFIG.transparent,
                opacity: 0,
              });
            }
            if (!child.material || !(child.material as any).__isAnimatedMaterial) {
              (filteredMaterialRef.current as any).__isAnimatedMaterial = true;
              child.material = filteredMaterialRef.current;
            }
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.opacity = FILTER_HIGHLIGHT_CONFIG.opacity * fadeProgressRef.current;
            
            // Add pulsing effect for filter highlighting
            const time = state.clock.elapsedTime;
            const pulse = (Math.sin(time * 3.0) + 1.0) * 0.5; // 0 to 1
            mat.emissiveIntensity = FILTER_HIGHLIGHT_CONFIG.emissiveIntensity * fadeProgressRef.current * (0.5 + pulse * 0.5);
            child.visible = true;
          } else if (fadeProgressRef.current === 0 && originalMaterial) {
            child.material = originalMaterial;
            delete (child.material as any).__isAnimatedMaterial;
            child.visible = true;
          }
        }
      });
    }
  });

  useEffect(() => {
    return () => {
      selectedMaterialRef.current?.dispose();
      hoveredMaterialsRef.current.forEach(mat => mat.dispose());
      hoveredMaterialsRef.current.clear();
      filteredMaterialRef.current?.dispose();
    };
  }, []);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
};

// Initialize GLB state on mount
const GLBInitializer: React.FC = () => {
  const { glbNodes, initializeGLBNodes } = useGLBState();
  
  useEffect(() => {
    // Initialize GLB nodes if not already done
    if (glbNodes.size === 0) {
      logger.log('LOADING', '🔧', 'GLBManager: Initializing GLB nodes...');
      MobileDiagnostics.log('glb-manager', 'Initializing GLB nodes');
      initializeGLBNodes();
    } else {
      MobileDiagnostics.log('glb-manager', 'GLB nodes already initialized', {
        count: glbNodes.size,
      });
    }
  }, [glbNodes.size, initializeGLBNodes]);

  return null;
};

export const GLBManager: React.FC = () => {
  const { glbNodes } = useGLBState();
  
  // Limit units based on device capabilities to reduce memory
  const isMobile = PerfFlags.isMobile;
  const nodesToRender = useMemo(() => {
    const allNodes = Array.from(glbNodes.values());
    
    if (isMobile) {
      // Mobile: DISABLED - load 0 units to test if crash occurs before GLB loading
      // If this fixes the crash, we know it's GLB-related; if not, it's Canvas/WebGL
      const limited = allNodes.slice(0, 0);
      console.log('📱 MOBILE: GLB units DISABLED for crash testing');
      MobileDiagnostics.warn('glb-manager', 'Mobile GLB units disabled for testing', {
        total: allNodes.length,
        rendering: limited.length,
        reason: 'Isolating crash source - Canvas vs GLB models'
      });
      return limited;
    }
    
    // Desktop: load ALL units for full functionality (selection + camera)
    // Memory optimization via frustum culling instead of limiting units
    console.log(`📦 Desktop: Loading all ${allNodes.length} units (frustum culling handles performance)`);
    MobileDiagnostics.log('glb-manager', 'Desktop load full', { 
      total: allNodes.length,
      rendering: allNodes.length,
      optimization: 'frustum culling active'
    });
    return allNodes;
  }, [glbNodes, isMobile]);
  
  return (
    <group>
      <GLBInitializer />
      {nodesToRender.map(node => (
        <GLBUnit key={node.key} node={node} />
      ))}
    </group>
  );
};

// Export individual components for flexibility
export { GLBUnit, GLBInitializer };
