import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useGLTF, useFBX } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Mesh, Object3D, MeshStandardMaterial, MeshPhysicalMaterial, Material, Color } from 'three';
import { UNIT_BOX_GLB_FILES } from '../data/unitBoxGlbFiles';
import { UnitData, LoadedModel } from '../types';
import { useFilterStore } from '../stores/useFilterStore';
import FresnelMaterial from '../materials/FresnelMaterial';
import { assetUrl } from '../lib/assets';
import { PerfFlags } from '../perf/PerfFlags';
import { logger } from '../utils/logger';
import { FILTER_HIGHLIGHT_CONFIG } from '../config/ghostMaterialConfig';

const DRACO_DECODER_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';

class UnitWarehouseErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    logger.error('UnitWarehouse runtime error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <group>{/* UnitWarehouse failed — check console for details */}</group>;
    }
    return this.props.children as any;
  }
}


function BoundingSphere({ onBoundingSphereData }: { onBoundingSphereData?: (data: {center: THREE.Vector3, radius: number}) => void }) {
  const { scene } = useGLTF(assetUrl('models/environment/road.glb'));

  React.useEffect(() => {
    if (scene) {

      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) / 2;


      if (onBoundingSphereData) {
        onBoundingSphereData({ center, radius });
      }
    }
  }, [scene, onBoundingSphereData]);

  return null;
}

interface UnitWarehouseProps {
  onUnitSelect: (unitName: string) => void;
  onUnitHover: (unitName: string | null) => void;
  selectedUnit: string | null;
  unitData: Record<string, UnitData>;
  filterHoveredUnit?: string | null; 
  onBoundingSphereData?: (data: {center: THREE.Vector3, radius: number}) => void; 
  onLoadingProgress?: (loaded: number, total: number) => void;
  showOnlyEventSpaces?: boolean;
  showOnlyStages?: boolean;
}

const isUnitFile = (fileName:string): boolean => {
  // Remove special Stage C exclusion to prevent z-fighting
  return !fileName.startsWith('boxes/');
};

const isBridgeFile = (fileName: string): boolean => {
  return false;
};

const getUnitName = (fileName: string): string => {
  return fileName.replace('.glb', '');
};

const SingleModelGLB: React.FC<{
  fileName: string;
  modelUrl: string;
  onLoad: (model: LoadedModel) => void;
  onBoundingSphereData?: (data: {center: THREE.Vector3, radius: number}) => void;
}> = React.memo(({ fileName, modelUrl, onLoad, onBoundingSphereData }) => {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLogged = useRef(false);
  const { gl } = useThree();

  if (!modelUrl) {
    console.error('❌ Missing modelUrl for:', fileName);
    return null;
  }

  const { scene, materials } = useGLTF(modelUrl, DRACO_DECODER_CDN);

  if (!scene) {
    logger.error('Scene not loaded for:', fileName);
    return null; 
  }

  Object.values(materials).forEach((mat: Material, index: number) => {
    mat.userData.slotIndex = index;
  });

  useEffect(() => {
    if (fileName.startsWith('boxes/')) {
    }
  }, []);

  useEffect(() => {
    try {
      if (scene && isLoading) {
        setIsLoading(false);
      }
    } catch (e) {
      logger.error('Error in SingleModel load detection effect:', e);
    }
  }, [scene, isLoading]);

  useEffect(() => {
    if (scene && !hasLogged.current) {
      hasLogged.current = true;

      const whiteMaterial = new THREE.MeshStandardMaterial({ color: 'white' });

      // Process materials immediately for transparent buildings and shadows
      console.log('🔍 Processing model:', fileName, 'with', scene.children.length, 'children');
      
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (fileName.includes('stages')) {
            console.log('🎭 Found STAGES mesh:', child.name, child.type);
          }
          
          // Store original material
          if (Array.isArray(child.material)) {
            (child as any).userData.originalMaterial = (child.material as any).map((m: any) =>
              m && typeof m.clone === 'function' ? m.clone() : m
            );
          } else {
            (child as any).userData.originalMaterial = (child.material && typeof (child.material as any).clone === 'function')
              ? (child.material as any).clone()
              : child.material;
          }

          // Enable shadows for all meshes
          child.castShadow = true;
          child.receiveShadow = true;
          child.userData.shadowsConfigured = true;

          // Anisotropic filtering for textures (enhanced on desktop)
          if (child.material) {
            const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
            const anisotropyLevel = PerfFlags.tier === "desktopHigh" ? maxAnisotropy : 16;
            
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat) => {
              if (mat.map) mat.map.anisotropy = anisotropyLevel;
              if ((mat as any).normalMap) (mat as any).normalMap.anisotropy = anisotropyLevel;
              if ((mat as any).roughnessMap) (mat as any).roughnessMap.anisotropy = anisotropyLevel;
              if ((mat as any).metalnessMap) (mat as any).metalnessMap.anisotropy = anisotropyLevel;
            });
          }

          // Transparent buildings - enhanced material with subtle physical properties
          if (fileName.includes('transparent buildings')) {
            logger.log('GLB', '🟢', 'Applying enhanced glass material to transparent buildings');
            
            const glassMaterial = new THREE.MeshPhysicalMaterial({
              color: 0xA9BCB8,
              transparent: true,
              opacity: 0.25,
              roughness: 0.3,
              metalness: 0.0,
              clearcoat: 0.1,
              clearcoatRoughness: 0.3,
              side: THREE.DoubleSide,
              depthWrite: false,
              alphaToCoverage: true,
              envMapIntensity: 0.5,
              emissive: 0x000000,
              emissiveIntensity: 0,
              toneMapped: true
            });
            
            child.material = glassMaterial;
            child.renderOrder = 100;
            child.material.needsUpdate = true;
          }

          // White wall - nearly invisible (95% transparent)
          if (fileName.includes('white wall')) {
            child.visible = true;
            if (child.material && !Array.isArray(child.material)) {
              const mat = child.material as THREE.MeshStandardMaterial;
              mat.transparent = true;
              mat.opacity = 0.05;
              mat.depthWrite = false;
              mat.needsUpdate = true;
            }
          }

          // Stages - FORCE fully opaque and visible (critical fix)
          if (fileName.includes('stages')) {
            child.visible = true;
            child.frustumCulled = false;
            child.renderOrder = 0;
            
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat: any) => {
                  mat.transparent = false;
                  mat.opacity = 1.0;
                  mat.depthWrite = true;
                  mat.visible = true;
                  mat.colorWrite = true;
                  mat.needsUpdate = true;
                });
              } else {
                const mat = child.material as any;
                mat.transparent = false;
                mat.opacity = 1.0;
                mat.depthWrite = true;
                mat.visible = true;
                mat.colorWrite = true;
                mat.needsUpdate = true;
              }
            }
            
            console.log('✅ STAGES mesh configured:', child.name, 'visible:', child.visible);
          }

          // Keep standard materials for stability - physical materials can be added selectively later
          child.userData.materialOptimized = true;
          child.userData.isOptimizable = true;
        }
      });

      const modelName = getUnitName(fileName);
      scene.name = modelName;

      const isUnit = isUnitFile(fileName);
      const isBridge = isBridgeFile(fileName);

      const consolidatedFiles = new Set([
        'environment/accessory concrete.glb',
        'environment/hq sidewalk 2.glb',
        'environment/road.glb',
        'environment/stages.glb',
        'environment/transparent buildings.glb',
        'environment/transparents sidewalk.glb',
        'environment/white wall.glb',
        'environment/palms.glb',
        'environment/frame-raw-14.glb',
        'environment/roof and walls.glb'
      ]);

      const isBoxFile = fileName.startsWith('boxes/');

      if (!consolidatedFiles.has(fileName) && !fileName.startsWith('boxes/')) {
        scene.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(scene);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        scene.position.set(-center.x, -center.y - 3, -center.z);
        scene.rotation.set(0, 0, 0);
        if ((scene as any).quaternion && typeof (scene as any).quaternion.identity === 'function') {
          (scene as any).quaternion.identity();
        }
        scene.updateMatrixWorld(true);
      }

      scene.updateMatrixWorld(true);
      
      const loadedModel: LoadedModel = {
        name: modelName,
        object: scene,
        isUnit,
        isBridge
      };

      // Removed special Stage C material handling to fix z-fighting issues
      // All stages now use standard material processing

      onLoad(loadedModel);
    }
  }, [scene, fileName, onLoad]);

  if (loadError) {
    logger.error('Model load error for:', fileName, loadError);
    return null; 
  }

  if (isLoading) {
    return null; 
  }

  return null; 
});

const SingleModelFBX: React.FC<{
  fileName: string;
  modelUrl: string;
  onLoad: (model: LoadedModel) => void;
  onBoundingSphereData?: (data: {center: THREE.Vector3, radius: number}) => void;
}> = React.memo(({ fileName, modelUrl, onLoad, onBoundingSphereData }) => {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLogged = useRef(false);

  if (!modelUrl) {
    console.error('❌ Missing modelUrl for FBX:', fileName);
    return null;
  }

  const scene = useFBX(modelUrl);
  const materials = {};

  if (!scene) {
    logger.error('Scene not loaded for:', fileName);
    return null; 
  }

  useEffect(() => {
    if (fileName.startsWith('boxes/')) {
    }
  }, []);

  useEffect(() => {
    try {
      if (scene && isLoading) {
        setIsLoading(false);
      }
    } catch (e) {
      logger.error('Error in SingleModelFBX load detection effect:', e);
    }
  }, [scene, isLoading]);

  useEffect(() => {
    if (scene && !hasLogged.current) {
      hasLogged.current = true;

      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Anisotropic filtering for textures (enhanced on desktop)
          if (child.material) {
            const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
            const anisotropyLevel = PerfFlags.tier === "desktopHigh" ? maxAnisotropy : 16;
            
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((mat) => {
              if (mat.map) mat.map.anisotropy = anisotropyLevel;
              if ((mat as any).normalMap) (mat as any).normalMap.anisotropy = anisotropyLevel;
              if ((mat as any).roughnessMap) (mat as any).roughnessMap.anisotropy = anisotropyLevel;
              if ((mat as any).metalnessMap) (mat as any).metalnessMap.anisotropy = anisotropyLevel;
            });
          }
        }
      });

      const whiteMaterial = new THREE.MeshStandardMaterial({ color: 'white' });

      const processMaterials = () => {
        const meshesToProcess: THREE.Mesh[] = [];

        scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshesToProcess.push(child);
          }
        });

        let processedCount = 0;
        const batchSize = 2; 

        const processBatch = () => {
          const batch = meshesToProcess.slice(processedCount, processedCount + batchSize);

          batch.forEach((child) => {
            if (Array.isArray(child.material)) {
              (child as any).userData.originalMaterial = (child.material as any).map((m: any) =>
                m && typeof m.clone === 'function' ? m.clone() : m
              );
            } else {
              (child as any).userData.originalMaterial = (child.material && typeof (child.material as any).clone === 'function')
                ? (child.material as any).clone()
                : child.material;
            }

            if (!child.userData.shadowsConfigured) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.userData.shadowsConfigured = true;
            }

            child.userData.materialOptimized = true;
            child.userData.isOptimizable = true;
          });

          processedCount += batchSize;

          if (processedCount < meshesToProcess.length) {
            if ('requestIdleCallback' in window) {
              requestIdleCallback(() => processBatch());
            } else {
              setTimeout(() => processBatch(), 0);
            }
          }
        };

        processBatch();
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => processMaterials());
      } else {
        setTimeout(() => processMaterials(), 0);
      }

      const modelName = getUnitName(fileName);
      scene.name = modelName;

      const isUnit = isUnitFile(fileName);
      const isBridge = isBridgeFile(fileName);

      const consolidatedFiles = new Set([
        'FULL_BUILD/LA CENTER WORLD.fbx'
      ]);

      const isBoxFile = fileName.startsWith('boxes/');

      if (!consolidatedFiles.has(fileName) && !fileName.startsWith('boxes/')) {
        scene.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(scene);
        const center = bbox.getCenter(new THREE.Vector3());
        const size = bbox.getSize(new THREE.Vector3());
        scene.position.set(-center.x, -center.y - 3, -center.z);
        scene.rotation.set(0, 0, 0);
        if ((scene as any).quaternion && typeof (scene as any).quaternion.identity === 'function') {
          (scene as any).quaternion.identity();
        }
        scene.updateMatrixWorld(true);
      }

      scene.updateMatrixWorld(true);
      
      const loadedModel: LoadedModel = {
        name: modelName,
        object: scene,
        isUnit,
        isBridge
      };

      onLoad(loadedModel);
    }
  }, [scene, fileName, onLoad]);

  if (isLoading) {
    return null; 
  }

  return <primitive object={scene} />; 
});

const SingleModel: React.FC<{
  fileName: string;
  onLoad: (model: LoadedModel) => void;
  onBoundingSphereData?: (data: {center: THREE.Vector3, radius: number}) => void;
}> = React.memo(({ fileName, onLoad, onBoundingSphereData }) => {
  const modelUrl = assetUrl(`models/${fileName}`);
  const isFBX = fileName.endsWith('.fbx');

  if (isFBX) {
    return <SingleModelFBX fileName={fileName} modelUrl={modelUrl} onLoad={onLoad} onBoundingSphereData={onBoundingSphereData} />;
  }

  return <SingleModelGLB fileName={fileName} modelUrl={modelUrl} onLoad={onLoad} onBoundingSphereData={onBoundingSphereData} />;
});

const UnitWarehouseComponent: React.FC<UnitWarehouseProps> = ({
  onUnitSelect,
  onUnitHover,
  selectedUnit,
  unitData,
  filterHoveredUnit,
  onBoundingSphereData,
  onLoadingProgress,
  showOnlyEventSpaces,
  showOnlyStages
}) => {
  const { activeFilter, isUnitActive, activeUnits } = useFilterStore();
  const activeUnitsList = useMemo(() => Array.from(activeUnits), [activeUnits]);

  const activeMaterial = useMemo(() => new FresnelMaterial({
    fresnelColor: '#00d5ff', 
    baseColor: '#0080ff', 
    amount: 1.5, 
    offset: 0.05, 
    intensity: 2.0, 
    fresnelAlpha: 1.0, 
    alpha: false, 
    time: 2.0 
  }), []);

  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0080FF'), 
    emissive: new THREE.Color('#0080FF'),
    emissiveIntensity: 2,
    transparent: true,
    opacity: 0.7,
    roughness: 0.3,
    metalness: 0.1,
  });

  // Hover material - softer/less intense than selection highlight
  const hoverMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ADD8E6'), 
    emissive: new THREE.Color('#ADD8E6'),
    emissiveIntensity: 1,
    transparent: true,
    opacity: 0.5,
    roughness: 0.4,
    metalness: 0.1,
  });

  // Filter highlight material for units matching active filters
  const filterHighlightMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(FILTER_HIGHLIGHT_CONFIG.color),
    emissive: new THREE.Color(FILTER_HIGHLIGHT_CONFIG.emissive),
    emissiveIntensity: FILTER_HIGHLIGHT_CONFIG.emissiveIntensity,
    metalness: FILTER_HIGHLIGHT_CONFIG.metalness,
    roughness: FILTER_HIGHLIGHT_CONFIG.roughness,
    transparent: FILTER_HIGHLIGHT_CONFIG.transparent,
    opacity: FILTER_HIGHLIGHT_CONFIG.opacity,
  }), []);

  const [modelsLoaded, setModelsLoaded] = useState(false); 
  const groupRef = useRef<THREE.Group>(null);
  const loadedModelsRef = useRef<LoadedModel[]>([]);
  const loadedBoxModelsCollection = useRef<LoadedModel[]>([]);
  const [boxLoadedModels, setBoxLoadedModels] = useState<LoadedModel[]>([]);
  const [boundingSphereData, setBoundingSphereData] = useState<{center: THREE.Vector3, radius: number} | null>(null);
  const [areBoxesLoaded, setAreBoxesLoaded] = useState(false);
  const shadowsComputed = useRef(false);

  const allModels = useMemo(() => {

    const folder = 'environment';

    

    const models = [

      `${folder}/accessory concrete.glb`,

      `${folder}/hq sidewalk 2.glb`,

      `${folder}/road.glb`,

      `${folder}/transparent buildings.glb`,

      `${folder}/transparents sidewalk.glb`,

      `${folder}/white wall.glb`,

      `${folder}/palms.glb`,

      `${folder}/frame-raw-14.glb`,

      `${folder}/roof and walls.glb`,

      `${folder}/stages.glb`

    ];

    

    console.log('dY"? Loading environment models:', models);

    

    return models;

  }, []);



  const boxFiles = useMemo(() => {
    const files: string[] = [];
    const isMobile = typeof window !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    // MOBILE OPTIMIZATION: Skip loading box files on mobile to prevent Safari crashes
    if (isMobile) {
      logger.log('GLB', '📱', 'Mobile detected - skipping unit boxes to prevent memory crash');
      return [];
    }

    for (const path of UNIT_BOX_GLB_FILES) {
      if (path && path.length > 0) {
        files.push(path);
      }
    }
    return files;
  }, []);

  const loadedModels = useMemo(() => loadedModelsRef.current, [loadedModelsRef]);

  // CRITICAL FIX: Sequential loading with delays to prevent iOS memory spike
  useEffect(() => {
    const preloadModels = async () => {
      // Load environment models sequentially with 300ms delays (iOS needs breathing room)
      for (let i = 0; i < allModels.length; i++) {
        const path = allModels[i];
        useGLTF.preload(assetUrl(`models/${path}`), DRACO_DECODER_CDN);
        if (PerfFlags.isIOS && i < allModels.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Skip box models entirely on mobile (iOS crashes with 97 units)
      if (!PerfFlags.isMobile) {
        for (let i = 0; i < Math.min(boxFiles.length, 20); i++) {
          const path = boxFiles[i];
          useGLTF.preload(assetUrl(`models/${path}`), DRACO_DECODER_CDN);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    };
    
    preloadModels();
  }, [allModels, boxFiles]);

  const handleModelLoad = useCallback((model: LoadedModel) => {
    loadedModelsRef.current.push(model);
    const totalModels = allModels.length + boxFiles.length;
    const loadedCount = loadedModelsRef.current.length + loadedBoxModelsCollection.current.length;
    console.log(`📦 Model loaded: ${model.name} (${loadedCount}/${totalModels})`);
    if (onLoadingProgress) {
      onLoadingProgress(loadedCount, totalModels);
      if (loadedModelsRef.current.length === allModels.length) setModelsLoaded(true); 
    } else {
      console.warn('⚠️ onLoadingProgress callback is undefined!');
    }
  }, [onLoadingProgress, allModels.length, boxFiles.length]);

  const handleBoxModelLoad = useCallback((model: LoadedModel, unitId: string) => {
    let meshCount = 0;
    model.object.traverse((child: Object3D) => {
      if (child instanceof Mesh) {
        meshCount++;
      }
    });

    model.object.traverse((child: Object3D) => {
      if ((child as any).material && !Array.isArray((child as any).material)) {
        (child as any).userData.originalMaterial = (child as any).material;

        const mat = (child as any).material as MeshStandardMaterial;
        (child as any).userData._originalEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0,0,0);
        (child as any).userData._originalEmissiveIntensity = (mat as any).emissiveIntensity ?? 1.0;
      }
    });

    loadedBoxModelsCollection.current = [...loadedBoxModelsCollection.current, model];

    const totalModels = allModels.length + boxFiles.length;
    const loadedCount = loadedModelsRef.current.length + loadedBoxModelsCollection.current.length;
    console.log(`📦 Box model loaded: ${unitId} (${loadedCount}/${totalModels})`);
    
    if (onLoadingProgress) {
      onLoadingProgress(loadedCount, totalModels);
    } else {
      console.warn('⚠️ onLoadingProgress callback is undefined for box models!');
    }

    if (loadedBoxModelsCollection.current.length === boxFiles.length) {
      setBoxLoadedModels(loadedBoxModelsCollection.current);
    }

    if (meshCount === 0) {
      logger.warn('GLB', '⚠️', `Box model ${unitId} has no meshes!`);
    }
  }, [boxFiles.length, onLoadingProgress, allModels.length]);

  // Helper function to check if unit is available in CSV data
  const isUnitAvailable = useCallback((unitName: string): boolean => {
    if (!unitData || Object.keys(unitData).length === 0) {
      // If no CSV data loaded, show all units (fallback behavior)
      return true;
    }
    
    // Extract unit name from full path (e.g., "boxes/First Street Building/First Floor/F-100" -> "F-100")
    const unitNameOnly = unitName.split('/').pop() || unitName;
    const cleanUnitName = unitNameOnly.replace(/\.glb$/i, '');
    
    // Try multiple key formats to find the unit
    const possibleKeys = [
      cleanUnitName.toLowerCase(),
      cleanUnitName,
      `${cleanUnitName.toLowerCase()}.glb`,
      `${cleanUnitName}.glb`,
      cleanUnitName.replace(/\s+/g, ''),
      cleanUnitName.replace(/\s+/g, '').toLowerCase(),
      unitName.toLowerCase(),
      unitName
    ];
    
    for (const key of possibleKeys) {
      const unit = unitData[key];
      if (unit) {
        // Check if status is true (available) 
        const isAvailable = unit.status === true;
        // Uncomment for debugging: console.log(`✅ Unit ${cleanUnitName} found in CSV (key: ${key}) - Available: ${isAvailable}`);
        return isAvailable;
      }
    }
    
    // If unit not found in CSV, hide it (assume unavailable)
    // Uncomment for debugging: console.log(`⚠️ Unit ${cleanUnitName} not found in CSV data - hiding`);
    return false;
  }, [unitData]);

  useEffect(() => {
    const activeUnits = activeUnitsList;

    if (activeUnits.length > 0) {
      console.log(`🎯 FILTER: Highlighting ${activeUnits.length} units`);
    }

    let activatedCount = 0;
    let hiddenByAvailabilityCount = 0;

    boxLoadedModels.forEach((model) => {
      const shouldBeActive = isUnitActive(model.name);
      const isAvailable = isUnitAvailable(model.name);

      model.object.traverse((child: Object3D) => {
        if (child instanceof Mesh) {
          // Reset to original material first
          if ((child as any).userData.originalMaterial) {
            child.material = (child as any).userData.originalMaterial;
          }

          // Make all available units visible by default
          if (isAvailable) {
            child.visible = true;
            
            // Apply filter highlighting to units that match active filters
            if (shouldBeActive) {
              activatedCount++;

              if (!(child as any).userData.originalMaterial) {
                (child as any).userData.originalMaterial = child.material;
              }

              // Apply filter highlight material instead of hiding other units
              child.material = filterHighlightMaterial;
              child.visible = true;
            }
          } else {
            // Hide unavailable units
            child.visible = false;
            hiddenByAvailabilityCount++;
          }
        }
      });
    });

    if (activatedCount > 0) {
      console.log(`✨ HIGHLIGHT: Applied filter highlighting to ${activatedCount} units`);
    }
    if (hiddenByAvailabilityCount > 0) {
      console.log(`👻 HIDDEN: ${hiddenByAvailabilityCount} units hidden (unavailable)`);
    }
    if (activeUnits.length > 0 && activatedCount === 0) {
      logger.warn('GLB', '❌', `FILTER SET but NO MESHES ACTIVATED! Available models:`, boxLoadedModels.map(m => m.name));
    }
  }, [activeFilter, boxLoadedModels, activeUnitsList, isUnitActive, isUnitAvailable, filterHighlightMaterial]);

  useEffect(() => {
    if (!selectedUnit) {
      return; 
    }

    // Only show selection highlight if unit is available
    const isAvailable = isUnitAvailable(selectedUnit);
    if (!isAvailable) {
      return;
    }

    const target = boxLoadedModels.find(m => m.name === selectedUnit);

    if (target) {
      target.object.traverse((child: Object3D) => {
        if (child instanceof Mesh) {
          if (!(child as any).userData.originalMaterial) {
            (child as any).userData.originalMaterial = child.material;
          }
          // Selection highlight takes priority over filter highlighting
          child.material = highlightMaterial;
          child.visible = true;
        }
      });
    }
  }, [selectedUnit, boxLoadedModels, highlightMaterial, isUnitAvailable]);

  // Hover highlighting effect (separate from selection)
  useEffect(() => {
    // Apply hover material if there's a hovered unit AND it's available
    if (filterHoveredUnit && filterHoveredUnit !== selectedUnit) {
      const isAvailable = isUnitAvailable(filterHoveredUnit);
      
      if (!isAvailable) {
        return;
      }

      const target = boxLoadedModels.find(m => m.name === filterHoveredUnit);
      
      if (target) {
        target.object.traverse((child: Object3D) => {
          if (child instanceof Mesh) {
            if (!(child as any).userData.originalMaterial) {
              (child as any).userData.originalMaterial = child.material;
            }
            // Hover highlight takes priority over filter highlighting
            child.material = hoverMaterial;
            child.visible = true;
          }
        });
      }
    }
  }, [filterHoveredUnit, selectedUnit, boxLoadedModels, hoverMaterial, isUnitAvailable]);

  useEffect(() => {
    if (onBoundingSphereData && boundingSphereData) {
      onBoundingSphereData(boundingSphereData);
    }
  }, [boundingSphereData, onBoundingSphereData]);

  useEffect(() => {
    if (modelsLoaded && !areBoxesLoaded) {
      setAreBoxesLoaded(true);
    }
  }, [modelsLoaded, areBoxesLoaded]);

  const frameCounter = useRef(0);

  useFrame((state) => {
    frameCounter.current++;

    if (activeMaterial && typeof activeMaterial.update === 'function') {
      activeMaterial.update();
    }

    // Update filter highlight pulsing animation
    if (FILTER_HIGHLIGHT_CONFIG.pulsing && filterHighlightMaterial) {
      const time = state.clock.elapsedTime;
      const pulseAmount = (Math.sin(time * 3.0) + 1.0) * 0.5; // 0 to 1
      filterHighlightMaterial.emissiveIntensity = FILTER_HIGHLIGHT_CONFIG.emissiveIntensity * (0.5 + pulseAmount * 0.5);
    }

    if (frameCounter.current % 3 !== 0) return;

    if (false && boundingSphereData && loadedModels.length > 0) {
      const cameraPosition = state.camera.position;

      loadedModels.forEach((model) => {
        model.object.traverse((child: Object3D) => {
          if (child instanceof Mesh && child.userData.isOptimizable && child.material instanceof THREE.MeshStandardMaterial) {
            const objectPosition = new THREE.Vector3();
            child.getWorldPosition(objectPosition);
            const distanceFromSphereCenter = objectPosition.distanceTo(boundingSphereData!.center);
            const normalizedSphereDistance = distanceFromSphereCenter / boundingSphereData!.radius;

            if (normalizedSphereDistance > 0.5) {
              const fadeAmount = Math.min((normalizedSphereDistance - 0.5) / 0.4, 1.0);

              if (child.material.color) {
                const originalColor = child.userData.originalColor || child.material.color.clone();
                child.userData.originalColor = originalColor;
                const whiteColor = new THREE.Color(1, 1, 1);
                const colorFadeAmount = Math.pow(fadeAmount, 0.5);
                child.material.color.lerpColors(originalColor, whiteColor, colorFadeAmount * 0.95);
              }

              if (normalizedSphereDistance > 0.7) {
                const opacityFade = Math.max(1.0 - (normalizedSphereDistance - 0.7) * 3.0, 0.1);
                child.material.opacity = opacityFade;
                child.material.transparent = true;
              }

              child.material.roughness = Math.min(child.userData.originalRoughness + fadeAmount * 0.8, 1.0);
              child.material.metalness = Math.max(child.userData.originalMetalness - fadeAmount * 0.6, 0.0);
              // Keep shadows enabled even during fade
              child.castShadow = true;

            } else {
              child.material.roughness = child.userData.originalRoughness;
              child.material.metalness = child.userData.originalMetalness;
              child.material.opacity = 1.0;
              child.material.transparent = false;

              if (child.userData.originalColor && child.material.color) {
                child.material.color.copy(child.userData.originalColor);
              }

              child.castShadow = true;
              child.receiveShadow = true;
            }

            child.material.needsUpdate = true;
          }
        });
      });
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <BoundingSphere onBoundingSphereData={setBoundingSphereData} />
      {allModels.map((fileName, index) => (
        <SingleModel
          key={fileName}
          fileName={fileName}
          onLoad={handleModelLoad}
        />
      ))}
      {areBoxesLoaded && (() => {
        try {
          if (!boxFiles || boxFiles.length === 0) {
            return null;
          }

          return boxFiles.map((boxPath) => (
            <SingleModel
              key={boxPath}
              fileName={boxPath}
              onLoad={(model) => handleBoxModelLoad(model, boxPath)}
            />
          ));
        } catch (error) {
          logger.error('Error rendering box models:', error);
          return null; 
        }
      })()}
      {boxLoadedModels.map((model) => (
        <primitive key={`box-${model.name}`} object={model.object} />
      ))}
      {loadedModels.filter(m => !m.name.endsWith('.fbx')).map((model) => (
        <primitive key={model.name} object={model.object} />
      ))}
    </group>
  );
};

export const UnitWarehouse: React.FC<UnitWarehouseProps> = (props) => {
  return (
    <UnitWarehouseErrorBoundary>
      <UnitWarehouseComponent {...props} />
    </UnitWarehouseErrorBoundary>
  );
};

export default UnitWarehouse;



