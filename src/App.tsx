import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CameraControls, Environment, useGLTF } from '@react-three/drei';
import { detectDevice, getMobileOptimizedSettings } from './utils/deviceDetection';
import { MobileMemoryManager } from './utils/memoryManager';
import { PerfFlags } from './perf/PerfFlags';
import { UNIT_BOX_GLB_FILES } from './data/unitBoxGlbFiles';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Home } from 'lucide-react';
import { assetUrl } from './lib/assets';
import { UnitWarehouse } from './components/UnitWarehouse';
import { SingleEnvironmentMesh } from './components/SingleEnvironmentMesh';
import UnitDetailPopup from './components/UnitDetailPopup';
import { ExploreUnitsPanel } from './ui/ExploreUnitsPanel';
import Sidebar from './ui/Sidebar/Sidebar';
import { GLBManager } from './components/GLBManager';
import { FrustumCuller } from './components/FrustumCuller';
import { UnitDetailsPopup } from './components/UnitDetailsPopup';
import { SelectedUnitOverlay } from './components/SelectedUnitOverlay';
import { CanvasClickHandler } from './components/CanvasClickHandler';
import { CanvasResizeHandler } from './components/CanvasResizeHandler';
import UnitRequestForm from './components/UnitRequestForm';
import { Unit3DPopup } from './components/Unit3DPopup';
import { Unit3DPopupOverlay } from './components/Unit3DPopupOverlay';
import { SingleUnitRequestForm } from './components/SingleUnitRequestForm';
import { FloorplanPopup } from './components/FloorplanPopup';
import { HoverToast } from './ui/HoverToast';
import { UnitHoverPreview } from './components/UnitHoverPreview';
import { SafariErrorBoundary } from './components/SafariErrorBoundary';
import { MobileErrorBoundary } from './components/MobileErrorBoundary';
import { SafariDebugBanner } from './components/SafariDebugBanner';
import { FloorplanContext } from './contexts/FloorplanContext';
import { Lighting } from './scene/Lighting';
import { ShadowHelper } from './components/ShadowHelper';
import { Effects } from './components/Effects';
// Performance-based lighting and effects
import { AdaptiveLighting } from './components/lighting/AdaptiveLighting';
import { SoftShadowsController } from './components/lighting/SoftShadowsController';
import { AtmosphericFog } from './components/environment/AtmosphericFog';
import { AdaptiveEffects } from './components/postprocessing/AdaptiveEffects';
import { lazy, Suspense } from 'react';
const PathTracer = lazy(() => import('./components/pathtracer/PathTracer').then(m => ({ default: m.PathTracer })));
import { useFaceDebugHotkey } from './hooks/useFaceDebugHotkey';
import { useUnitStore } from './stores/useUnitStore';
import { useSidebarState } from './ui/Sidebar/useSidebarState';
import { useExploreState, buildUnitsIndex, isUnitExcluded, type UnitRecord } from './store/exploreState';
import { useGLBState } from './store/glbState';
import { useCsvUnitData } from './hooks/useCsvUnitData';
import { emitEvent, getTimestamp } from './lib/events';
import { validateAllMaterials, setupRendererSafety } from './dev/MaterialValidator';
import { logger } from './utils/logger';
import { RootCanvas } from './ui/RootCanvas';
import type { Tier } from './lib/graphics/tier';
import { ErrorLogDisplay } from './components/ErrorLogDisplay';
import { PerformanceGovernorComponent } from './components/PerformanceGovernorComponent';
import { log as debugLog, SAFE, Q } from './lib/debug';
import { MobileDiagnostics } from './debug/mobileDiagnostics';


// Component to capture scene and gl refs + setup safety
const SceneCapture = ({ sceneRef, glRef }: { sceneRef: React.RefObject<THREE.Scene>, glRef: React.RefObject<THREE.WebGLRenderer> }) => {
  const { gl, scene } = useThree();
  const setupComplete = useRef(false);
  useFaceDebugHotkey();
  
  useEffect(() => {
    sceneRef.current = scene;
    glRef.current = gl;
    
    // Setup renderer safety once
    if (!setupComplete.current) {
      setupRendererSafety(gl);
      setupComplete.current = true;
    }
  }, [scene, gl, sceneRef, glRef]);
  
  // Run material validation after scene loads
  useEffect(() => {
    const timer = setTimeout(() => {
      validateAllMaterials(scene);
    }, 2000); // After models load
    
    return () => clearTimeout(timer);
  }, [scene]);
  
  return null;
};

// Material setup removed - materials handled by UnitWarehouse component

// Adaptive pixel ratio component for performance optimization
function AdaptivePixelRatio() {
  const current = useThree((state) => state.performance.current);
  const setPixelRatio = useThree((state) => state.setDpr);
  useEffect(() => {
    setPixelRatio(window.devicePixelRatio * current);
  }, [current, setPixelRatio]);
  return null;
}

const CSV_URL = assetUrl('unit-data-with-offices.csv');

// Legacy HDRI Environment component - kept for fallback but not used by default
const LegacyHDRIEnvironment = React.memo(() => {
  return (
    <Environment
      files={assetUrl("textures/qwantani_noon_puresky_2k.hdr")}
      background={false} // Sky component handles background
      backgroundIntensity={0.8}
      environmentIntensity={0.35} // Reduced for realism
      backgroundBlurriness={0.0}
      backgroundRotation={[0, 0, 0]}
      resolution={1024}
    />
  );
});

// Simple Error Boundary for HDRI loading
class HDRIErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
  }

  render() {
    if (this.state.hasError) {
      // Fallback to simple gradient background
      return <color attach="background" args={['#87CEEB']} />;
    }

    return this.props.children;
  }
}

// Comprehensive unit data based on actual GLB files in boxes folder
export const FALLBACK_UNIT_DATA = {
  // F-Series (Floor Units)  
  'f-10': { name: 'f-10', size: '1,200 sq ft', availability: 'Available', amenities: 'Ground floor unit with loading dock access', glb: 'boxes/Fifth Street Building/Ground Floor/F-10.glb' },
  'f-15': { name: 'f-15', size: '1,500 sq ft', availability: 'Available', amenities: 'Large ground floor space', glb: 'boxes/Fifth Street Building/Ground Floor/F-15.glb' },
  'f-20': { name: 'f-20', size: '1,800 sq ft', availability: 'Occupied', amenities: 'Premium floor unit', glb: 'boxes/Fifth Street Building/Ground Floor/F-20.glb' },
  'f-25': { name: 'f-25', size: '1,400 sq ft', availability: 'Available', amenities: 'Standard floor unit', glb: 'boxes/Fifth Street Building/Ground Floor/F-25.glb' },
  'f-30': { name: 'f-30', size: '2,000 sq ft', availability: 'Available', amenities: 'Large floor unit', glb: 'boxes/Fifth Street Building/Ground Floor/F-30.glb' },
  'f-35': { name: 'f-35', size: '1,600 sq ft', availability: 'Occupied', amenities: 'Corner floor unit', glb: 'boxes/Fifth Street Building/Ground Floor/F-35.glb' },
  'f-40': { name: 'f-40', size: '1,300 sq ft', availability: 'Available', amenities: 'Standard floor space', glb: 'boxes/Fifth Street Building/Ground Floor/F-40.glb' },
  'f-50': { name: 'f-50', size: '1,700 sq ft', availability: 'Available', amenities: 'Large floor space', glb: 'boxes/Fifth Street Building/Ground Floor/F-50.glb' },
  'f-60': { name: 'f-60', size: '1,400 sq ft', availability: 'Occupied', amenities: 'Mid-size floor unit', glb: 'boxes/Fifth Street Building/Ground Floor/F-60.glb' },
  'f-70': { name: 'f-70', size: '1,900 sq ft', availability: 'Available', amenities: 'Premium floor space', glb: 'boxes/Fifth Street Building/Ground Floor/F-70.glb' },
  'f-100': { name: 'f-100', size: '2,200 sq ft', availability: 'Available', amenities: 'Large floor unit with high ceilings', glb: 'boxes/Fifth Street Building/First Floor/F-100.glb', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/f100.png' },
  'f-105': { name: 'f-105', size: '1,800 sq ft', availability: 'Available', amenities: 'Floor unit with office space', glb: 'boxes/Fifth Street Building/First Floor/F-105.glb', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/f105.png' },
  'f-110 cr': { name: 'f-110 cr', size: '1,500 sq ft', availability: 'Occupied', amenities: 'Conference room unit', glb: 'boxes/Fifth Street Building/First Floor/F-110 CR.glb' },
  'f-115': { name: 'f-115', size: '1,600 sq ft', availability: 'Available', amenities: 'Standard floor unit', glb: 'boxes/Fifth Street Building/First Floor/F-115.glb', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/f115.png' },
  'f-140': { name: 'f-140', size: '2,400 sq ft', availability: 'Available', amenities: 'Extra large floor space', glb: 'boxes/Fifth Street Building/First Floor/F-140.glb', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/f140.png' },
  'f-150': { name: 'f-150', size: '2,000 sq ft', availability: 'Occupied', amenities: 'Premium floor unit', glb: 'boxes/Fifth Street Building/First Floor/F-150.glb', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/f150.png' },
  'f-160': { name: 'f-160', size: '1,700 sq ft', availability: 'Available', amenities: 'Large floor space', glb: 'boxes/Fifth Street Building/First Floor/F-160.glb' },
  'f-170': { name: 'f-170', size: '1,900 sq ft', availability: 'Available', amenities: 'Floor unit with loading access', glb: 'boxes/Fifth Street Building/First Floor/F-170.glb', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/f170.png' },
  'f-175': { name: 'f-175', size: '1,600 sq ft', availability: 'Available', amenities: 'Mid-size floor unit', glb: 'boxes/Fifth Street Building/First Floor/F-175.glb' },
  'f-180': { name: 'f-180', size: '2,100 sq ft', availability: 'Occupied', amenities: 'Large premium floor space', glb: 'boxes/Fifth Street Building/First Floor/F-180 .glb' },
  'f-185': { name: 'f-185', size: '1,800 sq ft', availability: 'Available', amenities: 'Floor unit with office' },
  'f-187': { name: 'f-187', size: '1,500 sq ft', availability: 'Available', amenities: 'Compact floor unit' },
  'f-190': { name: 'f-190', size: '2,000 sq ft', availability: 'Available', amenities: 'Large floor space' },
  'f-200': { name: 'f-200', size: '2,300 sq ft', availability: 'Occupied', amenities: 'Premium large floor unit' },
  'f-240': { name: 'f-240', size: '2,600 sq ft', availability: 'Available', amenities: 'Extra large floor space' },
  'f-250': { name: 'f-250', size: '2,400 sq ft', availability: 'Available', amenities: 'Large floor unit' },
  'f-280': { name: 'f-280', size: '2,800 sq ft', availability: 'Available', amenities: 'Extra large premium floor space', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/f280.png' },
  'f-290': { name: 'f-290', size: '2,500 sq ft', availability: 'Occupied', amenities: 'Large floor unit' },
  'f-300': { name: 'f-300', size: '3,000 sq ft', availability: 'Available', amenities: 'Extra large floor space' },
  'f-330': { name: 'f-330', size: '3,200 sq ft', availability: 'Available', amenities: 'Premium extra large unit' },
  'f-340': { name: 'f-340', size: '3,400 sq ft', availability: 'Available', amenities: 'Maximum floor space' },
  'f-350': { name: 'f-350', size: '3,500 sq ft', availability: 'Occupied', amenities: 'Premium maximum floor unit' },
  'f-360': { name: 'f-360', size: '3,600 sq ft', availability: 'Available', amenities: 'Largest floor space available' },
  'f-363': { name: 'f-363', size: '3,630 sq ft', availability: 'Available', amenities: 'Custom large floor unit' },
  'f-365': { name: 'f-365', size: '3,650 sq ft', availability: 'Available', amenities: 'Premium large space' },
  'f-380': { name: 'f-380', size: '3,800 sq ft', availability: 'Occupied', amenities: 'Maximum premium floor space' },

  // M-Series (Mezzanine Units)
  'm-20': { name: 'm-20', size: '800 sq ft', availability: 'Available', amenities: 'Elevated mezzanine space' },
  'm-40': { name: 'm-40', size: '1,200 sq ft', availability: 'Available', amenities: 'Large mezzanine unit' },
  'm-45': { name: 'm-45', size: '1,000 sq ft', availability: 'Occupied', amenities: 'Mid-size mezzanine' },
  'm-50': { name: 'm-50', size: '1,400 sq ft', availability: 'Available', amenities: 'Large mezzanine space' },
  'm-120': { name: 'm-120', size: '1,600 sq ft', availability: 'Available', amenities: 'Premium mezzanine unit', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/m120.png' },
  'm-130': { name: 'm-130', size: '1,800 sq ft', availability: 'Occupied', amenities: 'Large mezzanine space' },
  'm-140': { name: 'm-140', size: '1,700 sq ft', availability: 'Available', amenities: 'Mezzanine with office space', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/m140.png' },
  'm-145': { name: 'm-145', size: '1,500 sq ft', availability: 'Available', amenities: 'Mid-size mezzanine' },
  'm-150': { name: 'm-150', size: '2,000 sq ft', availability: 'Available', amenities: 'Large mezzanine unit', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/m150.png' },
  'm-160': { name: 'm-160', size: '1,900 sq ft', availability: 'Occupied', amenities: 'Premium mezzanine space' },
  'm-170': { name: 'm-170', size: '2,100 sq ft', availability: 'Available', amenities: 'Large elevated space' },
  'm-180': { name: 'm-180', size: '2,200 sq ft', availability: 'Available', amenities: 'Extra large mezzanine' },
  'm-210': { name: 'm-210', size: '2,400 sq ft', availability: 'Available', amenities: 'Premium large mezzanine' },
  'm-220': { name: 'm-220', size: '2,300 sq ft', availability: 'Occupied', amenities: 'Large mezzanine unit' },
  'm-230': { name: 'm-230', size: '2,500 sq ft', availability: 'Available', amenities: 'Extra large mezzanine space' },
  'm-240': { name: 'm-240', size: '2,600 sq ft', availability: 'Available', amenities: 'Maximum mezzanine unit' },
  'm-250': { name: 'm-250', size: '2,700 sq ft', availability: 'Available', amenities: 'Premium large mezzanine' },
  'm-260': { name: 'm-260', size: '2,800 sq ft', availability: 'Occupied', amenities: 'Extra large elevated space' },
  'm-270': { name: 'm-270', size: '2,900 sq ft', availability: 'Available', amenities: 'Maximum mezzanine space' },
  'm-300': { name: 'm-300', size: '3,200 sq ft', availability: 'Available', amenities: 'Premium maximum mezzanine' },
  'm-320': { name: 'm-320', size: '3,400 sq ft', availability: 'Available', amenities: 'Largest mezzanine available' },
  'm-340': { name: 'm-340', size: '3,600 sq ft', availability: 'Occupied', amenities: 'Premium maximum mezzanine unit' },
  'm-345': { name: 'm-345', size: '3,650 sq ft', availability: 'Available', amenities: 'Custom large mezzanine' },
  'm-350': { name: 'm-350', size: '3,800 sq ft', availability: 'Available', amenities: 'Maximum premium mezzanine space' },

  // T-Series (Tower Units) - Updated to match GLB file naming
  'T-100': { name: 'T-100', size: '1,000 sq ft', availability: 'Available', amenities: 'Tower level with city views' },
  'T-110': { name: 'T-110', size: '1,200 sq ft', availability: 'Available', amenities: 'Mid-level tower unit' },
  'T-200': { name: 'T-200', size: '1,800 sq ft', availability: 'Occupied', amenities: 'Large tower space' },
  'T-210': { name: 'T-210', size: '1,600 sq ft', availability: 'Available', amenities: 'Tower unit with windows' },
  'T-220': { name: 'T-220', size: '1,700 sq ft', availability: 'Available', amenities: 'Premium tower space' },
  'T-230': { name: 'T-230', size: '1,900 sq ft', availability: 'Available', amenities: 'Large tower unit' },
  'T-300': { name: 'T-300', size: '2,200 sq ft', availability: 'Occupied', amenities: 'Premium tower space' },
  'T-320': { name: 'T-320', size: '2,400 sq ft', availability: 'Available', amenities: 'Large tower unit' },
  'T-400 ': { name: 'T-400 ', size: '2,800 sq ft', availability: 'Available', amenities: 'Extra large tower space' },
  'T-410 ': { name: 'T-410 ', size: '2,600 sq ft', availability: 'Available', amenities: 'Large tower unit' },
  'T-420 ': { name: 'T-420 ', size: '2,700 sq ft', availability: 'Occupied', amenities: 'Premium tower space' },
  'T-430 ': { name: 'T-430 ', size: '2,900 sq ft', availability: 'Available', amenities: 'Extra large tower unit' },
  'T-450 ': { name: 'T-450 ', size: '3,000 sq ft', availability: 'Available', amenities: 'Maximum tower space' },
  'T-500': { name: 'T-500', size: '3,200 sq ft', availability: 'Available', amenities: 'Premium large tower unit' },
  'T-530': { name: 'T-530', size: '3,400 sq ft', availability: 'Occupied', amenities: 'Extra large tower space' },
  'T-550': { name: 'T-550', size: '3,600 sq ft', availability: 'Available', amenities: 'Maximum tower unit' },
  'T-600': { name: 'T-600', size: '3,800 sq ft', availability: 'Available', amenities: 'Premium maximum tower space' },
  'T-700 ': { name: 'T-700 ', size: '4,200 sq ft', availability: 'Available', amenities: 'Largest tower unit available' },
  'T-800 ': { name: 'T-800 ', size: '4,600 sq ft', availability: 'Occupied', amenities: 'Premium maximum tower space' },
  'T-900 ': { name: 'T-900 ', size: '5,000 sq ft', availability: 'Available', amenities: 'Premium maximum tower space' },
  'T- 950': { name: 'T- 950', size: '5,200 sq ft', availability: 'Available', amenities: 'Largest tower unit' },
  'T-1000 ': { name: 'T-1000 ', size: '5,500 sq ft', availability: 'Available', amenities: 'Premium maximum tower space' },
  'T-1100 ': { name: 'T-1100 ', size: '6,000 sq ft', availability: 'Available', amenities: 'Largest premium tower unit' },
  'T-1200 ': { name: 'T-1200 ', size: '6,500 sq ft', availability: 'Available', amenities: 'Maximum tower space available' },

  // Production Stages
  'stage a': { name: 'stage a', size: '8,000 sq ft', availability: 'Available', amenities: 'Full production stage with lighting grid' },
  'stage b': { name: 'stage b', size: '7,500 sq ft', availability: 'Occupied', amenities: 'Large production stage' },
  'stage c': { name: 'stage c', size: '8,500 sq ft', availability: 'Available', amenities: 'Premium production stage' },
  'stage d': { name: 'stage d', size: '7,200 sq ft', availability: 'Available', amenities: 'Standard production stage' },
  'stage e': { name: 'stage e', size: '9,000 sq ft', availability: 'Available', amenities: 'Large premium production stage' },
  'stage f': { name: 'stage f', size: '8,200 sq ft', availability: 'Occupied', amenities: 'Full service production stage' },
  'stage 7': { name: 'stage 7', size: '7,800 sq ft', availability: 'Available', amenities: 'Professional production stage' },
  'stage 8': { name: 'stage 8', size: '8,400 sq ft', availability: 'Available', amenities: 'Large production facility' },
  'mg - stage 7': { name: 'mg - stage 7', size: '6,500 sq ft', availability: 'Available', amenities: 'Mezzanine stage area', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/LACS_Site Map_M1_Color_page_1.png' },
  'studio o.m.': { name: 'studio o.m.', size: '5,000 sq ft', availability: 'Occupied', amenities: 'Private studio space', floorPlanUrl: import.meta.env.BASE_URL + 'floorplans/converted/LACS_Site Map_M1_Color_page_1.png' },
  'mill 2': { name: 'mill 2', size: '4,500 sq ft', availability: 'Available', amenities: 'Mill building workspace' },
  'mill 3': { name: 'mill 3', size: '4,800 sq ft', availability: 'Available', amenities: 'Large mill workspace' },
  'mill 3 office': { name: 'mill 3 office', size: '1,200 sq ft', availability: 'Available', amenities: 'Office space in mill building' },
  'mill 4': { name: 'mill 4', size: '5,200 sq ft', availability: 'Occupied', amenities: 'Premium mill workspace' },
  'production support - a': { name: 'production support - a', size: '2,000 sq ft', availability: 'Available', amenities: 'Production support facilities' },
  'production support - b': { name: 'production support - b', size: '2,200 sq ft', availability: 'Available', amenities: 'Large production support area' },
  'production support c': { name: 'production support c', size: '2,400 sq ft', availability: 'Available', amenities: 'Premium production support' },
  'production support - d': { name: 'production support - d', size: '2,600 sq ft', availability: 'Occupied', amenities: 'Large production support facility' },

  // Commercial Spaces
  'club 76 fifth street': { name: 'club 76 fifth street', size: '3,500 sq ft', availability: 'Available', amenities: 'Restaurant and entertainment venue' },
  'flix cafe': { name: 'flix cafe', size: '1,800 sq ft', availability: 'Available', amenities: 'Cafe and dining space' },
  'et lab': { name: 'et lab', size: '2,200 sq ft', availability: 'Occupied', amenities: 'Technology laboratory space' },
  'event area 1': { name: 'event area 1', size: '4,000 sq ft', availability: 'Available', amenities: 'Large event and conference space' },
  'kiosk': { name: 'kiosk', size: '200 sq ft', availability: 'Available', amenities: 'Small retail kiosk space' },
  'fg - library': { name: 'fg - library', size: '3,200 sq ft', availability: 'Available', amenities: 'Library and research facility' },
  'theater': { name: 'theater', size: '5,500 sq ft', availability: 'Occupied', amenities: 'Full theater and screening facility' },

  // Facilities & Services
  'f1 restrooms': { name: 'f1 restrooms', size: '400 sq ft', availability: 'Available', amenities: 'Floor 1 restroom facilities' },
  'f2 restrooms': { name: 'f2 restrooms', size: '450 sq ft', availability: 'Available', amenities: 'Floor 2 restroom facilities' },
  'f3 restrooms': { name: 'f3 restrooms', size: '420 sq ft', availability: 'Available', amenities: 'Floor 3 restroom facilities' },
  'fg - restroom': { name: 'fg - restroom', size: '380 sq ft', availability: 'Available', amenities: 'Ground floor restroom facilities' },
  'm1 restrooms': { name: 'm1 restrooms', size: '400 sq ft', availability: 'Available', amenities: 'Mezzanine 1 restroom facilities' },
  'm1 resstroom 2': { name: 'm1 resstroom 2', size: '420 sq ft', availability: 'Available', amenities: 'Additional mezzanine 1 restrooms' },
  'm2 restroom': { name: 'm2 restroom', size: '450 sq ft', availability: 'Available', amenities: 'Mezzanine 2 restroom facilities' },
  'm3 restroom': { name: 'm3 restroom', size: '430 sq ft', availability: 'Available', amenities: 'Mezzanine 3 restroom facilities' },
  'surface parking': { name: 'surface parking', size: '15,000 sq ft', availability: 'Available', amenities: 'Outdoor parking area' },
  'surface parking 2': { name: 'surface parking 2', size: '12,000 sq ft', availability: 'Available', amenities: 'Additional outdoor parking' },
  'park': { name: 'park', size: '8,000 sq ft', availability: 'Available', amenities: 'Green space and recreational area' },
  'lobby - 2': { name: 'lobby - 2', size: '1,200 sq ft', availability: 'Available', amenities: 'Building lobby and reception area' },
};

// Enhanced Camera controller with CameraControls for smooth navigation
const CameraController: React.FC<{
  selectedUnit: string | null;
  controlsRef: React.RefObject<any>;
}> = ({ controlsRef }) => {
  const { camera, size } = useThree();
  const isMobile = typeof window !== 'undefined' && matchMedia('(max-width:768px)').matches;
  
  useEffect(() => {
    camera.position.set(isMobile ? 9 : -10, isMobile ? 7 : 10, isMobile ? 9 : -14);
    camera.lookAt(0, 0, 0);
  }, [camera, isMobile]);

  useEffect(() => {
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
  }, [size.width, size.height, camera]);
  
  useEffect(() => {
    const checkControls = () => {
      if (controlsRef?.current) {
        return true;
      }
      return false;
    };
    
    if (!checkControls()) {
      const timeout = setTimeout(() => {
        checkControls();
      }, 100);
      
      return () => clearTimeout(timeout);
    }
  }, [controlsRef]);
  
  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      target={[0, 0, 0]}
      minPolarAngle={0}
      maxPolarAngle={Math.PI * 0.48}
      minDistance={8}
      maxDistance={25}
      dollySpeed={isMobile ? 0.8 : 0.5}
      truckSpeed={isMobile ? 1.2 : 1}
      azimuthRotateSpeed={isMobile ? 0.35 : 0.15}
      polarRotateSpeed={isMobile ? 0.35 : 0.15}
      draggingSmoothTime={isMobile ? 0.25 : 0.4}
      smoothTime={isMobile ? 0.25 : 0.4}
      enablePan={true}
      touches={{
        one: 1,
        two: 2,
        three: 0
      }}
    />
  );
};

// Details sidebar component with fixed positioning in lower right
const DetailsSidebar: React.FC<{
  selectedUnit: string | null;
  unitData: any;
  onDetailsClick: () => void;
  onClose: () => void;
}> = ({ selectedUnit, unitData, onDetailsClick, onClose }) => {
  if (!selectedUnit) return null;

  const data = unitData[selectedUnit];
  const isAvailable = data?.availability?.toLowerCase().includes('available') || data?.availability?.toLowerCase() === 'true';

  return (
    <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg p-4 w-64 border-2 border-slate-600 z-50">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          Unit {selectedUnit.toUpperCase()}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-xl"
        >
          ×
        </button>
      </div>
      
      <div className={`mb-3 p-2 rounded flex items-center ${
        isAvailable ? 'bg-sage-50 text-sage-800' : 'bg-red-50 text-red-800'
      }`}>
        <div className={`w-3 h-3 rounded-full mr-2 ${
          isAvailable ? 'bg-sage-500' : 'bg-red-700'
        }`}></div>
        {isAvailable ? 'Available' : 'Occupied'}
      </div>
      
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-1">Size</p>
        <p className="font-medium">{data?.size || 'N/A'}</p>
      </div>
      
      <button
        onClick={onDetailsClick}
        className="w-full bg-slate-600 hover:bg-slate-700 text-white font-medium py-2 px-4 rounded transition-colors"
      >
        View Details
      </button>
    </div>
  );
};

// RendererSetup removed - EnvHDRI handles all renderer configuration

function App() {
  const [canvasReady, setCanvasReady] = useState(false);
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [scenePolicy] = useState(() => {
    const param = Q.get('scene');
    const enabled = param === '0' ? false : true;
    const reason = enabled ? null : 'forced-off';
    MobileDiagnostics.log('scene', 'Scene policy resolved', { param, enabled, reason, isMobile: PerfFlags.isMobile });
    return { enabled, reason, param };
  });
  const { enabled: sceneEnabled, reason: sceneDisableReason, param: sceneParam } = scenePolicy;
  const { selectedUnit, hoveredUnit, setSelectedUnit, setHoveredUnit } = useUnitStore();
  
  useEffect(() => {
    debugLog.info('App mounted', { SAFE, isMobile: PerfFlags.isMobile, tier: PerfFlags.tier });
  }, []);
  const { drawerOpen, setDrawerOpen, selectedUnitKey, getUnitData, unitDetailsOpen, setUnitDetailsOpen, show3DPopup, setShow3DPopup, hoveredUnitKey } = useExploreState();
  const { setCameraControlsRef } = useGLBState();
  const { floorPlanExpanded, setFloorPlanExpanded } = useSidebarState();
  
  // Global hover preview state
  const [globalHoverPreview, setGlobalHoverPreview] = useState<{
    unitName: string;
    unitData: any;
    position: { x: number; y: number };
  } | null>(null);
  
  // Listen for hover preview updates from ExploreUnitsPanel
  useEffect(() => {
    const handleHoverUpdate = (event: CustomEvent) => {
      setGlobalHoverPreview(event.detail);
    };
    
    const handleHoverClear = () => {
      setGlobalHoverPreview(null);
    };
    
    window.addEventListener('unit-hover-update' as any, handleHoverUpdate);
    window.addEventListener('unit-hover-clear' as any, handleHoverClear);
    return () => {
      window.removeEventListener('unit-hover-update' as any, handleHoverUpdate);
      window.removeEventListener('unit-hover-clear' as any, handleHoverClear);
    };
  }, []);

  
  // Debug logging for state changes
  
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState('initializing'); // Track loading phase
  const [effectsReady, setEffectsReady] = useState(false); // Delay post-processing effects
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showSingleUnitRequest, setShowSingleUnitRequest] = useState(false);
  const [renderTier, setRenderTier] = useState<Tier>(PerfFlags.tier === 'mobileLow' ? 'mobile-low' : 'desktop-high');
  const sunPosition = useMemo(() => [165, 188, -40] as [number, number, number], []);
  const debugState = {
    tier: renderTier,
    ao: true,
    ssr: true,
    ssgi: false,
    pathtracer: false,
    ptBounces: 5,
    composerScale: 1.0,
    shadowBias: -0.00082,
    shadowNormalBias: 0.40,
    showShadowHelper: false,
    polygonOffsetEnabled: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    polygonOffsetRegex: 'slat|louver|mullion|trim|glass|window|panel',
  };
  
  // Refs to store Three.js instances for shadow settings callback
  const sceneRef = useRef<THREE.Scene | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const [requestUnitKey, setRequestUnitKey] = useState<string>('');
  const [requestUnitName, setRequestUnitName] = useState<string>('');
  const [showFloorplanPopup, setShowFloorplanPopup] = useState(false);
  const [floorplanPopupData, setFloorplanPopupData] = useState<{
    floorplanUrl: string;
    unitName: string;
    unitData?: any;
  } | null>(null);
  
  // Camera controls ref for navigation
  const orbitControlsRef = useRef<CameraControls>(null);
  
  // DISABLED: Preload loop was causing React hook violations and crashes
  // Calling useGLTF.preload() 10 times in a loop triggered Suspense issues
  // Will implement sequential lazy loading after Canvas mounts
  useEffect(() => {
    const isMobile = PerfFlags.isMobile;
    if (isMobile) {
      console.log('📦 GLB preload disabled for mobile - will load lazily');
    }
  }, []);
  
  // Add global error handler for mobile crashes with visible overlay
  useEffect(() => {
    const isMobile = PerfFlags.isMobile;
    
    const errorHandler = (event: ErrorEvent) => {
      const msg = `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
      console.error('🚨 GLOBAL ERROR:', event.error);
      console.error('🚨 Message:', event.message);
      console.error('🚨 Filename:', event.filename);
      console.error('🚨 Line:', event.lineno, 'Col:', event.colno);
      setErrorLog(prev => [...prev, msg]);
    };
    
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const msg = `Promise rejected: ${event.reason}`;
      console.error('🚨 UNHANDLED PROMISE REJECTION:', event.reason);
      setErrorLog(prev => [...prev, msg]);
    };
    
    if (isMobile) {
      console.log('📱 MOBILE DEVICE DETECTED - Enhanced logging enabled');
      console.log('📱 Device info:', {
        isIOS: PerfFlags.isIOS,
        userAgent: navigator.userAgent,
        memory: (navigator as any).deviceMemory || 'unknown',
        hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
        maxTouchPoints: navigator.maxTouchPoints || 'unknown'
      });
    }
    
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, []);
  
  // CRITICAL FIX: Delay Canvas mount by 3000ms to let page load settle (iOS requires this)
  useEffect(() => {
    const delay = PerfFlags.isIOS ? 3000 : 500; // 3 seconds for iOS to fully settle
    console.log('🚀 Canvas delay:', delay + 'ms', 'iOS:', PerfFlags.isIOS);
    
    const timer = setTimeout(() => {
      console.log('✅ Canvas ready - mounting WebGL');
      setCanvasReady(true);
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  // Mobile device detection and optimization settings
  const deviceCapabilities = useMemo(() => {
    const caps = detectDevice();
    return caps;
  }, []);
  
  // Force shadow initialization on app start - moved after deviceCapabilities definition
  useEffect(() => {
    // Ensure shadows are properly initialized when app starts - ALWAYS enable for all devices
    // Shadow settings are now handled by SimpleShadowDebug component directly
  }, []);
  const mobileSettings = useMemo(() => getMobileOptimizedSettings(deviceCapabilities), [deviceCapabilities]);
  
  useEffect(() => {
    if (!sceneEnabled) {
      MobileDiagnostics.warn('scene', '3D scene disabled', {
        reason: sceneDisableReason,
        param: sceneParam,
        isMobile: PerfFlags.isMobile,
      });
    }
  }, [sceneEnabled, sceneDisableReason, sceneParam]);
  
  // Shadow-enabled renderer configuration (iOS-optimized)
  const glConfig = useMemo(() => {
    const config: any = {
      powerPreference: PerfFlags.isIOS ? "low-power" : "high-performance",
      antialias: false,
      alpha: false,
      logarithmicDepthBuffer: false,
      preserveDrawingBuffer: false,
      stencil: false,
      depth: true,
      premultipliedAlpha: false,
      failIfMajorPerformanceCaveat: false,
    };
    
    if (PerfFlags.isIOS) {
      config.precision = "mediump";
    }
    
    return config;
  }, []);
  
  // Initialize memory manager for mobile devices
  useEffect(() => {
    if (deviceCapabilities.isMobile) {
      const memoryManager = MobileMemoryManager.getInstance();
      memoryManager.startMemoryMonitoring();
      
      // Add iOS low memory warning handler
      if (deviceCapabilities.isIOS) {
        const handleLowMemory = () => {
          console.error('🚨 iOS LOW MEMORY WARNING - Running cleanup (NO AUTO-RELOAD)');
          memoryManager.aggressiveCleanup();
          // REMOVED: window.location.reload() - Was causing infinite crash loop
          // Let user manually reload if needed
          alert('Low memory detected. Please close other apps or reload manually.');
        };
        
        // Listen for low memory events (iOS specific)
        window.addEventListener('memorywarning', handleLowMemory);
        
        return () => {
          memoryManager.stopMemoryMonitoring();
          window.removeEventListener('memorywarning', handleLowMemory);
        };
      }
      
      return () => {
        memoryManager.stopMemoryMonitoring();
      };
    }
  }, [deviceCapabilities.isMobile, deviceCapabilities.isIOS]);
  
  // Optimized camera controls initialization with faster polling and shorter timeout
  useEffect(() => {
    setCameraControlsRef(orbitControlsRef);
    
    let hasLogged = false;
    let timeoutId: NodeJS.Timeout;
    
    // Set initial target position when controls are ready
    const setupInitialTarget = () => {
      if (orbitControlsRef.current && orbitControlsRef.current.target && typeof orbitControlsRef.current.target.set === 'function') {
        if (!hasLogged) {
          hasLogged = true;
        }
        orbitControlsRef.current.target.set(0, 0, 0);
        orbitControlsRef.current.update();
        return true;
      }
      return false;
    };
    
    // Try immediate setup (camera controls should work regardless of HDRI load status)
    if (!setupInitialTarget()) {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max (increased for mobile)
      
      const interval = setInterval(() => {
        attempts++;
        if (setupInitialTarget()) {
          clearInterval(interval);
          clearTimeout(timeoutId);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          // Don't block the app - just set fallback target
          if (orbitControlsRef.current) {
            try {
              orbitControlsRef.current.target.set(0, 0, 0);
              orbitControlsRef.current.update();
            } catch (e) {
            }
          }
        }
      }, 100);
      
      // Alternative: try using requestAnimationFrame for faster checking
      const trySetupRAF = () => {
        if (!setupInitialTarget() && attempts < maxAttempts) {
          requestAnimationFrame(trySetupRAF);
        }
      };
      requestAnimationFrame(trySetupRAF);
      
      return () => {
        clearInterval(interval);
        clearTimeout(timeoutId);
      };
    }
  }, [setCameraControlsRef]);
  
  // Use new CSV-based data fetching
  const { data: csvUnitData, loading: isUnitDataLoading, error } = useCsvUnitData(CSV_URL);
  
  // Initialize viewer and emit ready event when models are loaded
  useEffect(() => {
    if (!modelsLoading) {
      emitEvent('evt.viewer.ready', {
        ts: getTimestamp(),
        assets: {
          env: 'warehouse',
          overlays: 'units'
        }
      });
    }
  }, [modelsLoading]);

  // Aggressive fallback for mobile Safari - if loading takes too long, bail out
  useEffect(() => {
    const timeout = deviceCapabilities.isMobile ? 8000 : 10000; // Faster timeout
    const fallbackTimer = setTimeout(() => {
      if (loadingPhase !== 'complete') {
        setLoadingProgress(100);
        setLoadingPhase('complete');
        setEffectsReady(true);
        setTimeout(() => setModelsLoading(false), 300);
      }
    }, timeout);
    
    return () => clearTimeout(fallbackTimer);
  }, [deviceCapabilities, loadingPhase]);

  // Handle WebGL context loss (common on mobile)
  useEffect(() => {
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.error('🚨 WebGL context lost - attempting recovery');
      logger.error('WebGL context lost - attempting recovery');
      
      setModelsLoading(true);
      setLoadingPhase('initializing');
    };

    const handleContextRestored = () => {
      console.log('✅ WebGL context restored - reloading app');
      logger.log('LOADING', '✅', 'WebGL context restored');
      
      setTimeout(() => {
        window.location.reload();
      }, 500);
    };

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);
      
      return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      };
    }
  }, []);
  
  // DISABLED: Context health monitor was causing "Canvas has existing context" error
  // The webglcontextlost/restored event handlers above are sufficient
  // useEffect(() => {
  //   // Context health check disabled - was conflicting with R3F
  // }, [canvasReady, sceneEnabled, selectedUnitKey]);

  // Handle window resize for proper canvas resizing
  useEffect(() => {
    const handleResize = () => {
      // Force canvas to recalculate size
      if (orbitControlsRef.current) {
        orbitControlsRef.current.update();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Add class to body for CSS-based sidebar transitions
  useEffect(() => {
    if (drawerOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen && floorPlanExpanded) {
      setFloorPlanExpanded(false);
    }
  }, [drawerOpen, floorPlanExpanded, setFloorPlanExpanded]);

  // Handle smooth transitions when sidebar width changes (floorplan expand/collapse)
  useEffect(() => {
    console.log('🔄 Floorplan expanded state changed:', floorPlanExpanded);
    
    if (floorPlanExpanded) {
      console.log('✅ Adding floorplan-expanded class');
      document.body.classList.add('floorplan-expanded');
    } else {
      console.log('❌ Removing floorplan-expanded class');
      document.body.classList.remove('floorplan-expanded');
    }
  }, [floorPlanExpanded]);

  // Adjust camera when sidebar/drawer opens or closes
  useEffect(() => {
    if (!orbitControlsRef.current) return;

    // Small delay to let the transition start
    const timer = setTimeout(() => {
      if (orbitControlsRef.current) {
        orbitControlsRef.current.update();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [drawerOpen, deviceCapabilities.isMobile]);

  // Use CSV data if available, otherwise fallback data
  const hasValidUnitData = csvUnitData && Object.keys(csvUnitData).length > 0;
  const effectiveUnitData = useMemo(() => {
    // Performance: removed debug logging
    return hasValidUnitData ? csvUnitData : {};
  }, [hasValidUnitData, csvUnitData]);

  // Read URL parameters on initial load to set selected unit
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const unitParam = urlParams.get('unit') || urlParams.get('sel');
    
    if (unitParam) {
      const unitKey = unitParam.toLowerCase();
      if (unitKey in effectiveUnitData) {
        setSelectedUnit(unitKey);
      }
    }
  }, [effectiveUnitData]);

  // Log unit data for debugging
  useEffect(() => {
    // Performance: debug logging removed
    
    if (error) {
    }
  }, [csvUnitData, hasValidUnitData, effectiveUnitData, error]);

  // Get explore state actions
  const { setUnitsData, setUnitsIndex } = useExploreState();

  // Integrate CSV data into explore state
  useEffect(() => {
    if (hasValidUnitData && csvUnitData) {
      
      // Convert CSV data to UnitRecord format for explore state
      const unitsMap = new Map<string, UnitRecord>();
      
      // Only include desired buildings
      const allowedBuildings = ['Fifth Street Building', 'Maryland Building', 'Tower Building'];
      
      Object.entries(csvUnitData).forEach(([unitKey, unitData]) => {
        // Skip buildings we don't want to show
        if (!allowedBuildings.includes(unitData.building)) {
          return;
        }
        
        // Skip excluded/unavailable suites at the data level
        if (isUnitExcluded(unitData.unit_name || unitData.name || unitKey)) {
          return;
        }
        
        // Skip duplicate entries (we store multiple keys for same unit)
        const primaryKey = unitData.unit_key || unitKey;
        if (unitsMap.has(primaryKey)) {
          return; // Skip duplicate
        }
        
        
        
        // Ensure floor data is present - log warning if missing
        const floorValue = unitData.floor?.toString() || '';
        if (!floorValue && unitData.building === 'Tower Building') {
          console.warn(`⚠️ Tower Building unit ${unitData.unit_name} has no floor data in CSV!`);
        }
        
        const unitRecord: UnitRecord = {
          unit_key: primaryKey,
          building: unitData.building || 'Unknown',
          floor: floorValue,
          unit_name: unitData.unit_name || unitData.name,
          status: unitData.status === true, // Convert to boolean as expected by UnitStatus type
          area_sqft: unitData.area_sqft || undefined,
          floorplan_url: unitData.floorplan || unitData.floorPlanUrl || unitData.floorplan_url,
          recipients: unitData.email_recipients ? [unitData.email_recipients] : ['owner@lacenter.com'], // Use CSV email or default
          kitchen_size: unitData.kitchen_size,
          unit_type: unitData.unit_type || 'Suite', // Copy unit type from CSV data
          private_offices: unitData.private_offices
        };
        
        // Store with the primary key
        unitsMap.set(primaryKey, unitRecord);
        
        // Also store with GLB variations for easier lookup
        unitsMap.set(`${primaryKey}.glb`, unitRecord);
        unitsMap.set(unitData.name, unitRecord);
        unitsMap.set(`${unitData.name}.glb`, unitRecord);
        
      });

      
      // Build hierarchical index
      const unitsIndex = buildUnitsIndex(unitsMap);
      
      
      // Update explore state
      setUnitsData(unitsMap);
      setUnitsIndex(unitsIndex);
      
    }
  }, [hasValidUnitData, csvUnitData, setUnitsData, setUnitsIndex]);

  // Log selected unit when it changes
  
  // Log sphere data when it changes

  const handleUnitSelect = useCallback((unitName: string) => {
    setSelectedUnit(unitName);
    setShowFullDetails(false); // Reset full details when selecting a new unit
  }, []);

  const handleDetailsClick = () => {
    setShowFullDetails(true);
  };

  const handleCloseDetails = () => {
    setShowFullDetails(false);
  };

  const handleCloseSidebar = () => {
    setSelectedUnit(null);
    setShowFullDetails(false);
  };

  
  // Handle explore drawer toggle
  const handleToggleExploreDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };
  
  // Handle close drawer
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  // Animation state for smooth camera movements
  const animationState = useRef<{
    isAnimating: boolean;
    startTime: number;
    duration: number;
    startAzimuth?: number;
    targetAzimuth?: number;
    startDistance?: number;
    targetDistance?: number;
    startPolar?: number;
    targetPolar?: number;
  }>({
    isAnimating: false,
    startTime: 0,
    duration: 1000
  });

  // Smooth easing function
  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // CameraControls-compatible animation function
  const animateCamera = useCallback((
    targetAzimuth?: number,
    targetDistance?: number,
    targetPolar?: number,
    resetToDefault?: boolean,
    duration: number = 1200
  ) => {
    if (!orbitControlsRef.current || animationState.current.isAnimating) return;

    const controls = orbitControlsRef.current;
    
    if (resetToDefault) {
      // Reset to initial position using CameraControls
      controls.reset(true);
      return;
    }

    // Use CameraControls methods for smooth animations
    if (targetAzimuth !== undefined) {
      controls.rotateAzimuthTo(targetAzimuth, true);
    }
    
    if (targetPolar !== undefined) {
      controls.rotatePolarTo(targetPolar, true);
    }
    
    if (targetDistance !== undefined) {
      const currentDistance = controls.distance;
      const dollyAmount = targetDistance / currentDistance;
      controls.dolly(dollyAmount, true);
    }
  }, []);

  // Navigation control functions with CameraControls
  const handleRotateLeft = useCallback(() => {
    if (orbitControlsRef.current) {
      const controls = orbitControlsRef.current;
      controls.rotate(-Math.PI / 8, 0, true); // 22.5 degrees left
    }
  }, []);

  const handleRotateRight = useCallback(() => {
    if (orbitControlsRef.current) {
      const controls = orbitControlsRef.current;
      controls.rotate(Math.PI / 8, 0, true); // 22.5 degrees right
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (orbitControlsRef.current) {
      const controls = orbitControlsRef.current;
      const distanceBefore = controls.distance;
      controls.dolly(0.85, true); // Zoom in (less than 1.0 to move camera closer)
      // Log distance after a brief delay to capture the change
      setTimeout(() => {
        const distanceAfter = controls.distance;
      }, 100);
    } else {
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (orbitControlsRef.current) {
      const controls = orbitControlsRef.current;
      const distanceBefore = controls.distance;
      controls.dolly(-0.35, true); // Zoom out (negative value to move camera away)
      // Log distance after a brief delay to capture the change
      setTimeout(() => {
        const distanceAfter = controls.distance;
      }, 100);
    } else {
    }
  }, []);

  const handleResetView = useCallback(() => {
    if (orbitControlsRef.current) {
      const controls = orbitControlsRef.current;
      controls.reset(true); // Reset to initial position
    }
  }, []);

  const handleRequestClick = useCallback(() => {
    setShowRequestForm(true);
  }, []);
  
  const handleExpandFloorplan = useCallback((floorplanUrl: string, unitName: string, unitData?: any) => {
    // Disable floorplan popup on mobile devices to prevent accidental triggers
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      console.log('🚫 Floorplan popup disabled on mobile device');
      return;
    }
    
    setFloorplanPopupData({
      floorplanUrl,
      unitName,
      unitData
    });
    setShowFloorplanPopup(true);
  }, []);
  
  const handleCloseFloorplanPopup = useCallback(() => {
    setShowFloorplanPopup(false);
    setFloorplanPopupData(null);
  }, []);
  
  // Listen for mobile progressive loading events
  useEffect(() => {
    if (!PerfFlags.isMobile) return;
    
    const handleLoadingUpdate = (event: CustomEvent) => {
      const { progress, message, phase } = event.detail;
      setLoadingProgress(progress);
      setLoadingPhase(phase);
      console.log(`📱 Mobile loading: ${progress}% - ${message}`);
    };
    
    const handleLoadingComplete = (event: CustomEvent) => {
      const { progress, message } = event.detail;
      setLoadingProgress(100);
      setLoadingPhase('complete');
      setEffectsReady(true);
      console.log(`✅ Mobile loading complete: ${message}`);
      
      setTimeout(() => {
        setModelsLoading(false);
      }, 500);
    };
    
    window.addEventListener('mobile-loading-update' as any, handleLoadingUpdate);
    window.addEventListener('mobile-loading-complete' as any, handleLoadingComplete);
    
    return () => {
      window.removeEventListener('mobile-loading-update' as any, handleLoadingUpdate);
      window.removeEventListener('mobile-loading-complete' as any, handleLoadingComplete);
    };
  }, []);
  
  // Start loading progress immediately on mount with guard to prevent infinite loop and failsafe timeout
  const loadingInitialized = useRef(false);
  useEffect(() => {
    if (loadingInitialized.current) return;
    loadingInitialized.current = true;
    
    console.log('⏳ Loading initialized, iOS:', PerfFlags.isIOS, 'isMobile:', PerfFlags.isMobile);
    setLoadingPhase('initializing');
    setLoadingProgress(5);
    
    // Mobile: Listen for progressive loading events instead of simulating
    if (PerfFlags.isMobile) {
      console.log('📱 Mobile: Waiting for progressive loading events...');
      // Start at 5% and let the events drive progress
      setLoadingPhase('loading-models');
      return;
    }
    
    // Desktop: Normal loading simulation
    const earlyProgress = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev < 15) return prev + 1;
        return prev;
      });
    }, 100);
    
    setTimeout(() => {
      setLoadingPhase('loading-assets');
      clearInterval(earlyProgress);
    }, 1000);
    
    // Failsafe: force complete after 12 seconds on mobile (10s on desktop)
    const failsafeTimeout = setTimeout(() => {
      if (loadingPhase !== 'complete') {
        console.warn('⚠️ Loading failsafe triggered');
        setLoadingPhase('complete');
        setLoadingProgress(100);
        setEffectsReady(true);
        setTimeout(() => setModelsLoading(false), 300);
      }
    }, deviceCapabilities.isMobile ? 12000 : 10000);
    
    return () => {
      clearInterval(earlyProgress);
      clearTimeout(failsafeTimeout);
    };
  }, [deviceCapabilities.isMobile, loadingPhase]);

  const handleModelsLoadingProgress = useCallback((loaded: number, total: number) => {
    // Map model loading to 15-70% of progress bar
    const modelProgress = Math.round((loaded / total) * 55) + 15;
    setLoadingProgress(modelProgress);
    setLoadingPhase('loading-models');
    
    if (loaded >= total) {
      setLoadingProgress(100);
      setLoadingPhase('complete');
      setEffectsReady(true);
      
      // Hide loading screen immediately
      setTimeout(() => {
        setModelsLoading(false);
      }, 100);
    }
  }, []);

  const floorplanContextValue = {
    openFloorplan: handleExpandFloorplan
  };

  return (
    <FloorplanContext.Provider value={floorplanContextValue}>
    <SafariErrorBoundary>
      {/* Loading screen - Portaled to body for true full-screen centering */}
      {modelsLoading && ReactDOM.createPortal(
        <div className="fixed inset-0 flex justify-center items-center" 
             style={{ 
               background: 'white',
               zIndex: 9999
             }}>
          <div className="text-center">
            
            {/* Pulsating GIF Logo */}
            <div className="mb-8">
              <div style={{
                overflow: 'hidden',
                maxWidth: '20rem',
                margin: '0 auto 1rem'
              }}>
                <img 
                  src={assetUrl('textures/333999.gif')} 
                  alt="Loading" 
                  className="w-full"
                  style={{ 
                    filter: 'none',
                    animation: 'pulse 2s ease-in-out infinite',
                    marginBottom: '-3px'
                  }}
                />
              </div>
            </div>
            
            {/* Loading Progress */}
            <div className="mb-6">
              <div className="bg-gray-200 rounded-full h-3 w-80 mx-auto overflow-hidden">
                <div 
                  className="bg-gray-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
              
              {/* Loading Phase Text */}
              <p className="text-gray-600 text-sm mt-3">
                {loadingPhase === 'initializing' && 'Initializing...'}
                {loadingPhase === 'loading-assets' && 'Loading assets...'}
                {loadingPhase === 'loading-models' && `Loading models... ${loadingProgress}%`}
                {loadingPhase === 'validating-materials' && 'Validating materials...'}
                {loadingPhase === 'compiling-shaders' && 'Compiling shaders...'}
                {loadingPhase === 'enabling-effects' && 'Enabling post-processing...'}
                {loadingPhase === 'complete' && 'Ready!'}
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Visible Error Overlay - Always on top */}
      {errorLog.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#dc2626',
          color: 'white',
          padding: '10px 20px',
          zIndex: 999999,
          fontSize: '14px',
          fontFamily: 'monospace',
          maxHeight: '200px',
          overflow: 'auto',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
            🚨 ERRORS DETECTED ({errorLog.length})
          </div>
          {errorLog.map((err, i) => (
            <div key={i} style={{ 
              padding: '5px 0', 
              borderBottom: i < errorLog.length - 1 ? '1px solid rgba(255,255,255,0.3)' : 'none'
            }}>
              {err}
            </div>
          ))}
        </div>
      )}

      <div className="app-viewport">
        <div className="app-layout">
          <div 
            className="scene-shell"
          >
{/* CSV loads in background - logo screen moved outside viewport */}
        
        {error && (
          <div className="absolute top-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded-md text-sm z-10">
            Using offline data - CSV unavailable: {error}
          </div>
        )}


        
        
        
        {/* CRITICAL FIX: Wrap canvas in error boundary to catch mobile crashes */}
        {canvasReady && sceneEnabled && (
        <MobileErrorBoundary>
        {console.log('🎬 Rendering RootCanvas - canvasReady:', canvasReady, 'sceneEnabled:', sceneEnabled)}
        <RootCanvas
          shadows={mobileSettings.shadows}
          dpr={mobileSettings.pixelRatio}
          camera={{ position: [-10, 10, -14], fov: 45, near: 0.5, far: 2000 }}
          style={{
            width: '100%',
            height: '100%',
            filter: "none"
          }}
          gl={glConfig}
          frameloop={PerfFlags.isIOS && showFloorplanPopup ? "demand" : "always"}
          onTierChange={setRenderTier}
          onCreated={({ camera }) => {
            console.log('🎨 Canvas created - Mobile safe-mode:', deviceCapabilities.isMobile);
            console.log('  - DPR:', mobileSettings.pixelRatio);
            console.log('  - Shadows:', mobileSettings.shadows);
            console.log('  - HDRI res:', mobileSettings.hdriResolution);
            console.log('  - Texture max:', mobileSettings.textureSize);
            camera.lookAt(0, 0, 0);
          }}
        >
          {(tier) => (
            <>
              {/* HDRI Environment - Using mobile-safe preset to prevent context loss */}
              <Environment
                files={assetUrl("textures/kloofendal_48d_partly_cloudy_puresky_2k.hdr")}
                background={true}
                backgroundIntensity={deviceCapabilities.isMobile ? 0.4 : 1.6}
                environmentIntensity={deviceCapabilities.isMobile ? 0.3 : 1.2}
                resolution={mobileSettings.hdriResolution}
                onLoad={() => console.log('✅ HDRI loaded - resolution:', mobileSettings.hdriResolution)}
                onError={(error) => console.error('❌ HDRI failed:', error)}
              />

              {/* Lighting System - Mobile-safe preset uses simple lighting */}
              {mobileSettings.useSimpleLighting ? (
                <>
                  {/* MOBILE SAFE-MODE: Basic ambient + directional only */}
                  <ambientLight intensity={0.4} />
                  <directionalLight 
                    position={[-34, 78, 28]} 
                    intensity={4.0} 
                    castShadow={false}
                  />
                  {console.log('💡 Using SIMPLE LIGHTING (mobile safe-mode)')}
                </>
              ) : (
                <>
                  {/* DESKTOP: Adaptive lighting with shadows */}
                  {sceneRef.current && (
                    <>
                      <AdaptiveLighting scene={sceneRef.current} tier={tier} />
                      <SoftShadowsController tier={tier} />
                    </>
                  )}
                </>
              )}
              
              {/* Shadow Debug Helper */}
              <ShadowHelper enabled={debugState.showShadowHelper} />

              {/* Fog - Disabled on mobile per safe-mode preset */}
              {!mobileSettings.disableFog && (
                <>
                  {tier.startsWith('desktop') && <fogExp2 attach="fog" args={['#b8d0e8', 0.004]} />}
                  <AtmosphericFog />
                </>
              )}

              {/* Capture scene and gl for external callbacks */}
              <SceneCapture sceneRef={sceneRef} glRef={glRef} />

              {/* 3D Scene - Testing Single Environment Mesh */}
              <SingleEnvironmentMesh tier={renderTier} />

              {/* GLB Manager for unit highlighting and interaction */}
              <GLBManager />
              
              {/* Frustum Culling for performance - only render visible objects */}
              <FrustumCuller />

              {/* Selected Unit Highlight Overlay - simplified for low power devices */}
              {!deviceCapabilities.isLowPowerDevice && <SelectedUnitOverlay />}

              {/* Canvas Click Handler for clearing selection */}
              <CanvasClickHandler />
              
              {/* Canvas Resize Handler for smooth sidebar transitions */}
              <CanvasResizeHandler />

              {/* God Rays Effect - DISABLED for testing new environment mesh */}
              {/* {effectsReady && <GodRays />} */}

              {/* Enhanced Camera Controls with proper object framing */}
              <CameraController selectedUnit={selectedUnit} controlsRef={orbitControlsRef} />



              {/* Performance Governor - mobile FPS enforcement */}
              <PerformanceGovernorComponent />

              {/* Post-processing - Disabled on mobile per safe-mode preset */}
              {!mobileSettings.postProcessing && !SAFE && effectsReady && debugState.ao && !debugState.pathtracer && (
                <AdaptiveEffects tier={tier} />
              )}
              {mobileSettings.postProcessing && console.log('⚠️ Post-processing DISABLED (mobile safe-mode)')}

              {/* GPU Path Tracer - mutually exclusive with post-processing */}
              {effectsReady && debugState.pathtracer && (
                <Suspense fallback={null}>
                  <PathTracer 
                    enabled={debugState.pathtracer} 
                    tier={renderTier}
                    bounces={debugState.ptBounces}
                    renderScale={0.5}
                    tiles={{ x: 2, y: 2 }}
                  />
                </Suspense>
              )}

              {/* 3D Scene Popup */}
              <Unit3DPopupOverlay
                onExpand={() => {
                  setShow3DPopup(false);
                  setUnitDetailsOpen(true);
                }}
                onRequest={(unitKey) => {
                  const unitData = getUnitData(unitKey);
                  setRequestUnitKey(unitKey);
                  setRequestUnitName(unitData?.unit_name || unitKey);
                  setShowSingleUnitRequest(true);
                }}
                onClose={() => setShow3DPopup(false)}
              />
            </>
          )}
        </RootCanvas>
        </MobileErrorBoundary>
        )}

        {!sceneEnabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/80 border border-dashed border-slate-300 rounded-2xl text-center px-6 py-8">
            <p className="font-semibold text-slate-800">3D scene disabled for mobile UI focus</p>
            <p className="text-sm text-slate-600 mt-2 max-w-sm">
              {sceneDisableReason === 'forced-off'
                ? 'The ?scene=0 flag is active. Remove it or set ?scene=1 to re-enable the 3D environment.'
                : 'Mobile safe mode temporarily disables the 3D environment. Append ?scene=1 to the URL if you need to test it.'}
            </p>
          </div>
        )}
        


          </div>  {/* Close scene-shell */}
        
        
        

        {/* Camera Controls - Bottom Center (Desktop) / Bottom Right (Mobile) */}
        {sceneEnabled && !modelsLoading && (
          <div 
            className={deviceCapabilities.isMobile 
              ? "fixed right-4 bottom-6 z-40" 
              : "fixed bottom-6 z-40 camera-controls-desktop -translate-x-1/2"}
            style={deviceCapabilities.isMobile ? {} : {}}
          >
            <div className={deviceCapabilities.isMobile
              ? "bg-white/90 backdrop-blur-md rounded-lg shadow-xl border border-black/5 p-2 flex flex-col gap-2"
              : "bg-white/90 backdrop-blur-md rounded-lg shadow-xl border border-black/5 p-3"}>
              <div className={deviceCapabilities.isMobile ? "flex flex-col gap-2" : "grid grid-cols-5 gap-2"}>
                <button
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs shadow-sm hover:shadow transition flex items-center justify-center"
                  onClick={handleRotateLeft}
                  title="Rotate Left"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs shadow-sm hover:shadow transition flex items-center justify-center"
                  onClick={handleRotateRight}
                  title="Rotate Right"
                >
                  <RotateCw size={14} />
                </button>
                <button
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs shadow-sm hover:shadow transition flex items-center justify-center"
                  onClick={handleZoomIn}
                  title="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs shadow-sm hover:shadow transition flex items-center justify-center"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  className="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-xs shadow-sm hover:shadow transition flex items-center justify-center"
                  onClick={handleResetView}
                  title="Reset View"
                >
                  <Home size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Sidebar - All devices */}
        {!modelsLoading && (
          <Sidebar />
        )}

        
        {/* Dynamic Details Sidebar */}
        <DetailsSidebar
          selectedUnit={selectedUnit}
          unitData={effectiveUnitData}
          onDetailsClick={handleDetailsClick}
          onClose={handleCloseSidebar}
        />
        

        
        {/* Hover Toast - using new component */}
        <HoverToast />
      
      {/* Full Unit Detail Popup */}
      {showFullDetails && (
        <UnitDetailPopup 
          selectedUnit={selectedUnit}
          unitData={effectiveUnitData}
          onClose={handleCloseDetails}
        />
      )}

      {/* Explore Suites Details Popup - Center of Scene (Desktop Only) */}
      {!deviceCapabilities.isMobile && !PerfFlags.isMobile && (
        <UnitDetailsPopup
          unit={selectedUnitKey ? getUnitData(selectedUnitKey) || {
            unit_key: selectedUnitKey,
            unit_name: selectedUnitKey.toUpperCase(),
            status: 'Unknown',
            recipients: [],
            area_sqft: undefined,
            price_per_sqft: undefined,
            lease_term: undefined,
            notes: 'Unit data not available in CSV',
            floorplan_url: undefined
          } as any : null}
          isOpen={unitDetailsOpen}
          onClose={() => {
            setUnitDetailsOpen(false);
          }}
        />
      )}

      {/* Request Form */}
      <UnitRequestForm
        isOpen={showRequestForm}
        onClose={() => setShowRequestForm(false)}
      />
      
      {/* Single Unit Request Form */}
      {showSingleUnitRequest && (
        <SingleUnitRequestForm
          isOpen={showSingleUnitRequest}
          onClose={() => {
            setShowSingleUnitRequest(false);
          }}
          unitKey={requestUnitKey}
          unitName={requestUnitName}
        />
      )}

      {/* Shadow Debug UI - DISABLED (using RealisticSun instead) */}
      
      {/* Floorplan Popup */}
      <FloorplanPopup
        isOpen={showFloorplanPopup && !!floorplanPopupData}
        onClose={handleCloseFloorplanPopup}
        floorplanUrl={floorplanPopupData?.floorplanUrl || ''}
        unitName={floorplanPopupData?.unitName || ''}
        unitData={floorplanPopupData?.unitData}
      />
      
      {/* Debug info removed */}
      
      {/* Global Hover Preview - Rendered at App level for true global positioning */}
      {globalHoverPreview && (
        <UnitHoverPreview
          unitName={globalHoverPreview.unitName}
          unitData={globalHoverPreview.unitData}
          position={globalHoverPreview.position}
          isVisible={true}
        />
      )}

      {/* Sun Position Controls - Removed, values hard-coded */}
      
      
      {/* Error Log Display - Shows persisted errors for mobile debugging */}
      <ErrorLogDisplay />
      
      {/* Safari Debug Banner - On-screen debugging for real iOS devices */}
      <SafariDebugBanner />
        </div>  {/* Close app-layout */}
      </div>  {/* Close app-viewport */}
    </SafariErrorBoundary>
    </FloorplanContext.Provider>
  );
}

export default App;
