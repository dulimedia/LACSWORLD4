import { Box3, Vector3, DirectionalLight, Scene } from 'three';

export function fitShadowCameraToScene(scene: Scene, light: DirectionalLight) {
  const box = new Box3().setFromObject(scene);
  if (box.isEmpty()) return;

  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const maxDim = Math.max(size.x, size.z);

  const padding = 1.1;
  const half = (maxDim * padding) / 2;

  light.shadow.camera.left = -half;
  light.shadow.camera.right = half;
  light.shadow.camera.top = half;
  light.shadow.camera.bottom = -half;
  light.shadow.camera.updateProjectionMatrix();

  light.shadow.bias = -0.0001;
  light.shadow.normalBias = 0.02;
}