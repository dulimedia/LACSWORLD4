import React from 'react';
import { Canvas } from '@react-three/fiber';

export function TestCube() {
  return (
    <Canvas
      onCreated={(state) => {
        console.log('✅ CANVAS CREATED SUCCESSFULLY');
        console.log('WebGL Version:', state.gl.getParameter(state.gl.VERSION));
        console.log('WebGL Vendor:', state.gl.getParameter(state.gl.VENDOR));
        console.log('WebGL Renderer:', state.gl.getParameter(state.gl.RENDERER));
        console.log('Max Texture Size:', state.gl.getParameter(state.gl.MAX_TEXTURE_SIZE));
        
        alert(`Canvas OK! WebGL ${state.gl.getParameter(state.gl.VERSION)}`);
      }}
      onError={(error) => {
        console.error('🚨 CANVAS CREATION ERROR:', error);
        alert('Canvas failed: ' + (error?.message || 'Unknown error'));
      }}
      gl={{
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'low-power',
      }}
    >
      <color attach="background" args={['#ff00ff']} />
      
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      
      <mesh rotation={[0.5, 0.5, 0]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="hotpink" roughness={0.3} metalness={0.8} />
      </mesh>
    </Canvas>
  );
}
