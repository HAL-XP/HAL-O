import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export function GridFloor() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#84cc16') },
  }), [])

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
      float dist = length(vWorldPos.xz);

      // Major grid — thin, precise lines
      float gridSize = 2.0;
      vec2 grid = abs(fract(vWorldPos.xz / gridSize - 0.5) - 0.5) / fwidth(vWorldPos.xz / gridSize);
      float line = min(grid.x, grid.y);
      float gridAlpha = 1.0 - min(line, 1.0);

      // Fine sub-grid — very subtle
      float subSize = 0.5;
      vec2 subGrid = abs(fract(vWorldPos.xz / subSize - 0.5) - 0.5) / fwidth(vWorldPos.xz / subSize);
      float subLine = min(subGrid.x, subGrid.y);
      float subAlpha = (1.0 - min(subLine, 1.0)) * 0.06;

      // Distance fade — exponential for realism
      float fade = exp(-dist * 0.04);

      // Center glow — subtle red from the sphere reflected on the floor
      float centerGlow = exp(-dist * 0.15) * 0.08;
      vec3 centerColor = vec3(1.0, 0.1, 0.0);

      // Subtle pulse wave — very faint, slow
      float pulse = smoothstep(0.8, 0.0, abs(dist - mod(uTime * 1.5, 50.0))) * 0.08;

      // Base floor — dark reflective surface
      vec3 baseColor = vec3(0.02, 0.025, 0.03);

      // Grid line color — dim, not bright
      vec3 lineColor = uColor * 0.4;

      // Combine
      float lineStrength = (gridAlpha * 0.12 + subAlpha + pulse) * fade;
      vec3 color = baseColor + lineColor * lineStrength + centerColor * centerGlow;

      // Very slight floor opacity everywhere (reflective surface feel)
      float alpha = 0.85 * fade + lineStrength;

      gl_FragColor = vec4(color, alpha);
    }
  `

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <planeGeometry args={[120, 120, 1, 1]} />
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
