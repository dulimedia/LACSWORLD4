import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { makeFacesBehave } from '../utils/makeFacesBehave';
import { fixInvertedFacesSelective } from '../utils/fixInvertedFacesSelective';
import { generateSceneReport, printReport } from '../debug/MeshInspector';
import { useThree } from '@react-three/fiber';
import { simplifyGeometryForMobile, shouldSimplifyMesh, optimizeMeshForMobile } from '../utils/simplifyGeometry';
import { PerfFlags } from '../perf/PerfFlags';
import { log } from '../utils/debugFlags';
import { applyPolygonOffset } from '../materials/applyPolygonOffset';

interface SingleEnvironmentMeshProps {
  tier: string;
}

const DRACO_DECODER_CDN = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
const OTHER_ENVIRONMENT_COUNT = 7;

function useDracoGLTF(path: string) {
  return useGLTF(path, DRACO_DECODER_CDN);
}

export function SingleEnvironmentMesh({ tier }: SingleEnvironmentMeshProps) {
  const { gl } = useThree();
  
  const isMobile = (tier === 'mobile-low');

  if (isMobile) {
    console.log('dY"? SingleEnvironmentMesh: mobile palms mode');
    return <MobileEnvironment />;
  }
  console.log('dY"? SingleEnvironmentMesh: desktop environment mode');
  
  const accessory = useDracoGLTF('/models/environment/accessory concrete.glb');
  const hqSidewalk = useDracoGLTF('/models/environment/hq sidewalk 2.glb');
  const road = useDracoGLTF('/models/environment/road.glb');
  const transparentBuildings = useDracoGLTF('/models/environment/transparent buildings.glb');
  const transparentSidewalk = useDracoGLTF('/models/environment/transparents sidewalk.glb');
  const whiteWall = useDracoGLTF('/models/environment/white wall.glb');
  const palms = useDracoGLTF('/models/environment/palms.glb');
  const frame = useDracoGLTF('/models/environment/frame-raw-14.glb');
  const roof = useDracoGLTF('/models/environment/roof and walls.glb');
  const stages = useDracoGLTF('/models/environment/stages.glb');



  const otherScenes = useMemo(

    () =>

      [

        accessory.scene,

        hqSidewalk.scene,

        road.scene,

        transparentBuildings.scene,

        transparentSidewalk.scene,

        whiteWall.scene,

        palms.scene

      ].filter((scene): scene is THREE.Object3D => Boolean(scene)),

    [

      accessory.scene,

      hqSidewalk.scene,

      road.scene,

      transparentBuildings.scene,

      transparentSidewalk.scene,

      whiteWall.scene,

      palms.scene

    ]

  );



  const othersReady = otherScenes.length === OTHER_ENVIRONMENT_COUNT;

  const frameReady = Boolean(frame.scene);

  const roofReady = Boolean(roof.scene);

  const stagesReady = Boolean(stages.scene);



  const shadowsEnabled = gl && (gl as any).shadowMap?.enabled !== false;


  useEffect(() => {

    if (!isMobile) return;

    if (othersReady && frameReady && roofReady && stagesReady && !mobilePhaseDispatch.current.completed) {

      mobilePhaseDispatch.current.completed = true;

      if (window.dispatchEvent) {

        window.dispatchEvent(new CustomEvent('mobile-loading-complete', {

          detail: {

            phase: 'complete',

            progress: 100,

            message: 'All environment models loaded!'

          }

        }));

      }

    }

  }, [isMobile, othersReady, frameReady, roofReady, stagesReady]);



// Process environment models when loaded

  useEffect(() => {

    if (!otherScenes.length) return;

    console.log('dY"? Processing environment set (others)...');

    otherScenes.forEach((scene) => {

      makeFacesBehave(scene, true);

      

      scene.traverse((child) => {

        if ((child as THREE.Mesh).isMesh) {

          const mesh = child as THREE.Mesh;

          

          if (mesh.geometry && mesh.geometry.attributes.position && isMobile) {

            log.verbose(`  Mesh: ${mesh.name || 'unnamed'} (${mesh.geometry.attributes.position.count} vertices)`);

            optimizeMeshForMobile(mesh);

          }

          

          if (shadowsEnabled) {

            mesh.castShadow = true;

            mesh.receiveShadow = true;

          } else if (isMobile) {

            mesh.castShadow = false;

            mesh.receiveShadow = false;

          }

          

          if (mesh.material) {

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

            materials.forEach((mat: any) => {

              if (shadowsEnabled) {

                mat.shadowSide = THREE.FrontSide;

              }

              

              const meshNameLower = (mesh.name || '').toLowerCase();

              if (meshNameLower.includes('road') || meshNameLower.includes('plaza') || 

                  meshNameLower.includes('roof') || meshNameLower.includes('floor') ||

                  meshNameLower.includes('ground') || meshNameLower.includes('deck')) {

                applyPolygonOffset(mat);

              }

              

              if (isMobile) {

                if (mat.normalMap) {

                  mat.normalMap.dispose();

                  mat.normalMap = null as any;

                }

                if (mat.roughnessMap) {

                  mat.roughnessMap.dispose();

                  mat.roughnessMap = null as any;

                }

                if (mat.metalnessMap) {

                  mat.metalnessMap.dispose();

                  mat.metalnessMap = null as any;

                }

                mat.envMapIntensity = 0.6;

              }

              

              if (mat.map) mat.map.needsUpdate = true;

              mat.needsUpdate = true;

            });

          }

        }

      });

    });

    

    if (isMobile) {

      if ((window as any).gc) {

        (window as any).gc();

      }

      if (window.requestIdleCallback) {

        window.requestIdleCallback(() => {

          console.log('dYO? Mobile: Idle cleanup after environment processing');

        });

      }

    }

  }, [otherScenes, isMobile, shadowsEnabled]);



// Process frame model when loaded

  useEffect(() => {

    const scene = frame.scene;

    if (scene) {

      console.log('dY"? Processing Frame model...');

      if (isMobile) console.log('dY"? Mobile: Processing Frame with optimizations');

      

      makeFacesBehave(scene);

      log.verbose('dY"? Running selective face fixer on Frame...');

      fixInvertedFacesSelective(scene);

      

      if (isMobile) {

        scene.traverse((child) => {

          if ((child as THREE.Mesh).isMesh) {

            const mesh = child as THREE.Mesh;

            mesh.castShadow = false;

            mesh.receiveShadow = false;

            

            if (shouldSimplifyMesh(mesh, isMobile) && mesh.geometry) {

              const originalVerts = mesh.geometry.attributes.position.count;

              mesh.geometry = simplifyGeometryForMobile(mesh.geometry, 0.7);

              const newVerts = mesh.geometry.attributes.position.count;

              console.log(`dY"% Frame simplified ${mesh.name}: ${originalVerts} ?+' ${newVerts} vertices`);

            }

          }

        });

      }

      

      if (isMobile) {

        console.log('dY-`?,? Mobile: Cleanup after Frame processing');

        if ((window as any).gc) {

          (window as any).gc();

        }

      }

    }

  }, [frame.scene, isMobile]);



// Process roof model when loaded

  useEffect(() => {

    const scene = roof.scene;

    if (scene) {

      console.log('dY"? Processing Roof model...');

      if (isMobile) console.log('dY"? Mobile: Processing Roof with optimizations');

      

      makeFacesBehave(scene);

      

      scene.traverse((child) => {

        if ((child as THREE.Mesh).isMesh) {

          const mesh = child as THREE.Mesh;

          

          if (shadowsEnabled) {

            mesh.castShadow = true;

            mesh.receiveShadow = true;

            

            if (mesh.material) {

              if (Array.isArray(mesh.material)) {

                mesh.material.forEach(mat => {

                  mat.shadowSide = THREE.FrontSide;

                });

              } else {

                mesh.material.shadowSide = THREE.FrontSide;

              }

            }

          } else if (isMobile) {

            mesh.castShadow = false;

            mesh.receiveShadow = false;

            

            if (shouldSimplifyMesh(mesh, isMobile) && mesh.geometry) {

              const originalVerts = mesh.geometry.attributes.position.count;

              mesh.geometry = simplifyGeometryForMobile(mesh.geometry, 0.7);

              const newVerts = mesh.geometry.attributes.position.count;

              console.log(`dY"% Roof simplified ${mesh.name}: ${originalVerts} ?+' ${newVerts} vertices`);

            }

          }

        }

      });

      

      if (isMobile) {

        console.log('dY-`?,? Mobile: Cleanup after Roof processing');

        if ((window as any).gc) {

          (window as any).gc();

        }

      }

    }

  }, [roof.scene, isMobile]);



// Process stages model when loaded

  useEffect(() => {

    const scene = stages.scene;

    if (scene) {

      console.log('dY"? Processing Stages model...');

      if (isMobile) console.log('dY"? Mobile: Processing Stages with optimizations');

      

      makeFacesBehave(scene);

      

      let meshCount = 0;

      scene.traverse((child) => {

        if ((child as THREE.Mesh).isMesh) {

          const mesh = child as THREE.Mesh;

          meshCount++;

          

          mesh.visible = true;

          mesh.frustumCulled = false;

          

          if (mesh.material) {

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

            materials.forEach((mat: any) => {

              mat.visible = true;

              mat.transparent = false;

              mat.opacity = 1.0;

              mat.side = THREE.FrontSide;

              mat.depthWrite = true;

              mat.depthTest = true;

              mat.needsUpdate = true;

            });

          }

          

          if (shadowsEnabled) {

            mesh.castShadow = true;

            mesh.receiveShadow = true;

            

            if (mesh.material) {

              if (Array.isArray(mesh.material)) {

                mesh.material.forEach(mat => {

                  mat.shadowSide = THREE.FrontSide;

                });

              } else {

                mesh.material.shadowSide = THREE.FrontSide;

              }

            }

          } else if (isMobile) {

            mesh.castShadow = false;

            mesh.receiveShadow = false;

            

            if (shouldSimplifyMesh(mesh, isMobile) && mesh.geometry) {

              const originalVerts = mesh.geometry.attributes.position.count;

              mesh.geometry = simplifyGeometryForMobile(mesh.geometry, 0.7);

              const newVerts = mesh.geometry.attributes.position.count;

              console.log(`dY"% Stages simplified ${mesh.name}: ${originalVerts} ?+' ${newVerts} vertices`);

            }

          }

        }

      });

      

      console.log('?o. Stages configured: ' + meshCount + ' meshes, all set to visible');

      

      if (isMobile) {

        console.log('dY-`?,? Mobile: Final cleanup after Stages processing');

        if ((window as any).gc) {

          (window as any).gc();

        }

        

        if (navigator && (navigator as any).deviceMemory) {

          console.log(`dY"S Device memory: ${(navigator as any).deviceMemory}GB`);

        }

        

        if (gl && gl.info) {

          const info = gl.info;

          console.log('dY"S WebGL memory:', {

            geometries: info.memory.geometries,

            textures: info.memory.textures,

            programs: info.programs?.length || 0

          });

        }

        

        console.log('?o. Mobile: All models loaded and optimized successfully!');

      }

    }

  }, [stages.scene, isMobile, gl]);



  return (
    <>
      {otherScenes.map((scene, index) => (
        <primitive key={`environment-other-${index}`} object={scene} />
      ))}
      {frame.scene && <primitive object={frame.scene} />}
      {roof.scene && <primitive object={roof.scene} />}
      {stages.scene && <primitive object={stages.scene} />}
    </>
  );
}

function MobileEnvironment() {
  const road = useDracoGLTF('/models/environment/road.glb', DRACO_DECODER_CDN);
  const sidewalk = useDracoGLTF('/models/environment/hq sidewalk 2.glb', DRACO_DECODER_CDN);
  const transparentSidewalk = useDracoGLTF('/models/environment/transparents sidewalk.glb', DRACO_DECODER_CDN);

  useEffect(() => {
    const scenes = [road.scene, sidewalk.scene, transparentSidewalk.scene].filter(Boolean);
    
    scenes.forEach(scene => {
      if (!scene) return;
      makeFacesBehave(scene, true);

      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((mat: any) => {
              if (mat.normalMap) {
                mat.normalMap.dispose();
                mat.normalMap = null;
              }
              if (mat.roughnessMap) {
                mat.roughnessMap.dispose();
                mat.roughnessMap = null;
              }
              mat.needsUpdate = true;
            });
          }
        }
      });
    });
  }, [road.scene, sidewalk.scene, transparentSidewalk.scene]);

  return (
    <>
      {road.scene && <primitive object={road.scene} />}
      {sidewalk.scene && <primitive object={sidewalk.scene} />}
      {transparentSidewalk.scene && <primitive object={transparentSidewalk.scene} />}
    </>
  );
}
