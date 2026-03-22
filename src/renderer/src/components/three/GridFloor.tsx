import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function GridFloor() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#84cc16') },
  }), [])

  // Read primary color from CSS
  useMemo(() => {
    const style = getComputedStyle(document.documentElement)
    const primary = style.getPropertyValue('--primary').trim()
    if (primary) uniforms.uColor.value.set(primary)
  }, [uniforms])

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta
    }
  })

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `

  const fragmentShader = `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vWorldPos;

    void main() {
      // Grid lines
      float gridSize = 2.0;
      vec2 grid = abs(fract(vWorldPos.xz / gridSize - 0.5) - 0.5) / fwidth(vWorldPos.xz / gridSize);
      float line = min(grid.x, grid.y);
      float gridAlpha = 1.0 - min(line, 1.0);

      // Finer sub-grid
      float subGridSize = 0.5;
      vec2 subGrid = abs(fract(vWorldPos.xz / subGridSize - 0.5) - 0.5) / fwidth(vWorldPos.xz / subGridSize);
      float subLine = min(subGrid.x, subGrid.y);
      float subGridAlpha = (1.0 - min(subLine, 1.0)) * 0.15;

      // Distance fade — grid fades into darkness at distance
      float dist = length(vWorldPos.xz);
      float fade = smoothstep(40.0, 5.0, dist);

      // Pulse wave expanding from center
      float pulse = smoothstep(0.5, 0.0, abs(dist - mod(uTime * 3.0, 45.0)));
      float pulseGlow = pulse * 0.4;

      // Combine
      float alpha = (gridAlpha * 0.5 + subGridAlpha + pulseGlow) * fade;

      // Glow color
      vec3 color = uColor * (1.0 + pulseGlow * 2.0);

      gl_FragColor = vec4(color, alpha * 0.6);
    }
  `

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}>
      <planeGeometry args={[80, 80, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}
