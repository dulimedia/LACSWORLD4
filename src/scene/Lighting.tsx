import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { DirectionalLight, OrthographicCamera, PCFSoftShadowMap, AmbientLight } from "three";
import { useFitDirectionalLightShadow } from "./ShadowFit";
import { logger } from "../utils/logger";
import { PerfFlags } from "../perf/PerfFlags";

export interface LightingProps {
  shadowBias?: number;
  shadowNormalBias?: number;
  shadowMaxExtent?: number;
  shadowMargin?: number;
  sunPosition?: [number, number, number];
  onLightCreated?: (light: DirectionalLight) => void;
}

export function Lighting({
  shadowBias,
  shadowNormalBias,
  shadowMaxExtent,
  shadowMargin,
  sunPosition,
  onLightCreated
}: LightingProps = {}) {
  const { scene, gl } = useThree();
  const sunRef = useRef<DirectionalLight | null>(null);
  const isMobileRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;

    const setupLighting = () => {
      const tier = PerfFlags.qualityTier === 'LOW'
        ? 'mobile-low'
        : PerfFlags.qualityTier === 'BALANCED'
          ? 'mobile-high'
          : 'desktop-high';
      const isMobileLow = tier === 'mobile-low';
      const isMobileHigh = tier === 'mobile-high';
      const isMobile = isMobileLow || isMobileHigh;
      isMobileRef.current = isMobile;
      if (cancelled) return;

      const resolvedShadowBias = shadowBias ?? PerfFlags.SHADOW_BIAS;
      const resolvedShadowNormalBias = shadowNormalBias ?? PerfFlags.SHADOW_NORMAL_BIAS;
      const resolvedMapSize = PerfFlags.SHADOW_MAP_SIZE;
      const resolvedSunPosition: [number, number, number] = sunPosition ?? [-40, 30, 20];

      const oldLights = scene.children.filter(o => o.userData.__sunLight || o.userData.__ambientLight);
      oldLights.forEach(o => scene.remove(o));

      const sun = new DirectionalLight(0xffffff, isMobile ? 3.2 : 7.2);
      sun.position.set(...resolvedSunPosition);
      sun.userData.__sunLight = true;

      if (isMobileLow) {
        sun.castShadow = false;
        gl.shadowMap.enabled = false;
        console.log('Mobile-low: shadows disabled');
      } else if (isMobileHigh) {
        sun.castShadow = true;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = PCFSoftShadowMap;

        sun.shadow.mapSize.set(resolvedMapSize, resolvedMapSize);
        sun.shadow.bias = resolvedShadowBias;
        sun.shadow.normalBias = resolvedShadowNormalBias;
        sun.shadow.radius = 2;

        const cam = sun.shadow.camera as OrthographicCamera;
        cam.left = -70;
        cam.right = 70;
        cam.top = 70;
        cam.bottom = -70;
        cam.near = 0.5;
        cam.far = 180;
        cam.updateProjectionMatrix();

        console.log('Mobile-high: lightweight shadows enabled');
      } else {
        sun.castShadow = true;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = PCFSoftShadowMap;

        sun.shadow.mapSize.set(resolvedMapSize, resolvedMapSize);
        sun.shadow.bias = resolvedShadowBias;
        sun.shadow.normalBias = resolvedShadowNormalBias;
        sun.shadow.radius = 0.5;

        const cam = sun.shadow.camera as OrthographicCamera;
        cam.left = -90;
        cam.right = 90;
        cam.top = 90;
        cam.bottom = -90;
        cam.near = 0.5;
        cam.far = 260;
        cam.updateProjectionMatrix();

        logger.log('LOADING', 'SUN', `Desktop: shadow map initialized ${resolvedMapSize}x${resolvedMapSize}`);
      }

      scene.add(sun);
      sunRef.current = sun;

      if (isMobileLow) {
        const ambient = new AmbientLight(0x404040, 0.6);
        ambient.userData.__ambientLight = true;
        scene.add(ambient);
      } else if (isMobileHigh) {
        const ambient = new AmbientLight(0x303030, 0.4);
        ambient.userData.__ambientLight = true;
        scene.add(ambient);
      } else {
        const ambient = new AmbientLight(0x404040, 0.3);
        ambient.userData.__ambientLight = true;
        scene.add(ambient);
      }

      onLightCreated?.(sun);
      logger.log('LOADING', 'SUN', `Lighting configured for ${tier} (shadows: ${sun.castShadow})`);
    };

    setupLighting();

    return () => {
      cancelled = true;
      const lights = scene.children.filter(o => o.userData.__sunLight || o.userData.__ambientLight);
      lights.forEach(l => scene.remove(l));
      sunRef.current = null;
    };
  }, [scene, gl, shadowBias, shadowNormalBias, sunPosition, onLightCreated]);

  useFitDirectionalLightShadow(
    isMobileRef.current ? null : sunRef.current,
    {
      maxExtent: shadowMaxExtent ?? PerfFlags.SHADOW_MAX_EXTENT,
      margin: shadowMargin ?? PerfFlags.SHADOW_MARGIN,
      mapSize: PerfFlags.SHADOW_MAP_SIZE,
      snap: true
    }
  );

  return null;
}
