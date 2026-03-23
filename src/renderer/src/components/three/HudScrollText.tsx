import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useThreeTheme } from '../../contexts/ThreeThemeContext'

// ── Static HUD text lines — randomized at mount ──

const SYSTEM_LINES = [
  'SYNC OK', 'BUFFER 47.2%', 'CHANNEL OPEN', 'HASH 0xA7F3',
  'NODE ACTIVE', 'LINK STABLE', 'CORE 98.1%', 'SCAN PASS',
  'RELAY CONFIRMED', 'LATENCY 0.3ms', 'FLUX NOMINAL',
  'CIPHER AES-256', 'HANDSHAKE OK', 'BLOCK 0xE1D9',
  'THREAD 044', 'PULSE 72bpm', 'SECTOR 7G CLEAR',
  'CRC VERIFIED', 'AUTH TOKEN VALID', 'HEAP 218MB',
  'STREAM ACTIVE', 'PACKET 0x1F2A', 'INTEGRITY 100%',
  'UPLINK 440MHz', 'CACHE HIT', 'SPINLOCK FREE',
  'QUANTUM LOCK', 'DRIFT 0.001%', 'VECTOR ALIGNED',
  'MATRIX STABLE', 'FRAME 16.6ms', 'GPU 12%',
  'VRAM 4.2GB', 'PIPELINE FLUSH', 'REGISTER 0xFF',
  'SIGNAL 9dB', 'ENTROPY HIGH', 'CHECKSUM A4B7',
  'PHOTON COUNT 847', 'WARP FIELD OK', 'SHIELDS 97%',
]

function generateHexTimestamp(): string {
  const now = Date.now()
  return '0x' + (now & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0')
}

function pickLines(count: number): string[] {
  const result: string[] = []
  const pool = [...SYSTEM_LINES]
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.2) {
      // Insert a hex timestamp
      result.push(generateHexTimestamp())
    } else {
      const idx = Math.floor(Math.random() * pool.length)
      result.push(pool[idx])
    }
  }
  return result
}

/**
 * Single scrolling text strip rendered as a shader plane.
 * The text is baked into a canvas texture and the UV is scrolled over time.
 */
function ScrollStrip({
  xPos,
  direction,
  lineCount = 40,
  opacity = 0.14,
}: {
  xPos: number
  direction: 1 | -1
  lineCount?: number
  opacity?: number
}) {
  const theme = useThreeTheme()
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)

  // Bake text into a canvas texture once, using theme colors
  const texture = useMemo(() => {
    const lines = pickLines(lineCount)
    const lineHeight = 16
    const canvasW = 160
    const canvasH = lineCount * lineHeight

    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvasW, canvasH)

    ctx.font = '10px "Cascadia Code", "Fira Code", monospace'
    ctx.textBaseline = 'top'

    // Convert theme colors to RGBA strings for canvas
    const pA = theme.particleA
    const pB = theme.particleB

    for (let i = 0; i < lines.length; i++) {
      // Alternate between primary and secondary particle colors with varied brightness
      const isPrimary = Math.random() > 0.3
      const brightness = 0.4 + Math.random() * 0.6
      if (isPrimary) {
        ctx.fillStyle = `rgba(${Math.round(pA.r * 255)}, ${Math.round(pA.g * 255)}, ${Math.round(pA.b * 255)}, ${brightness})`
      } else {
        ctx.fillStyle = `rgba(${Math.round(pB.r * 255)}, ${Math.round(pB.g * 255)}, ${Math.round(pB.b * 255)}, ${brightness})`
      }
      ctx.fillText(lines[i], 4, i * lineHeight + 2)
    }

    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [lineCount, theme.particleA, theme.particleB])

  useFrame((state) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.elapsedTime
      matRef.current.uniforms.uOpacity.value = opacity
    }
  })

  return (
    <mesh ref={meshRef} position={[xPos, 4.5, -8]} renderOrder={-1}>
      <planeGeometry args={[2.2, 10]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        uniforms={{
          uTexture: { value: texture },
          uTime: { value: 0 },
          uDirection: { value: direction },
          uOpacity: { value: 0.14 },
        }}
        vertexShader={/* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform sampler2D uTexture;
          uniform float uTime;
          uniform float uDirection;
          uniform float uOpacity;
          varying vec2 vUv;

          void main() {
            // Scroll UV vertically over time
            vec2 uv = vUv;
            uv.y = fract(uv.y + uTime * 0.03 * uDirection);

            vec4 texColor = texture2D(uTexture, uv);

            // Fade edges vertically for seamless loop
            float edgeFade = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);

            // Subtle scanline effect
            float scanline = 0.92 + 0.08 * sin(vUv.y * 300.0 + uTime * 2.0);

            float alpha = texColor.a * edgeFade * uOpacity * scanline;
            gl_FragColor = vec4(texColor.rgb, alpha);
          }
        `}
      />
    </mesh>
  )
}

/**
 * Two ambient scrolling HUD text strips on left and right edges of the 3D scene.
 * Very subtle, low opacity — ambient texture, not distracting.
 */
export function HudScrollText({ opacity = 0.14 }: { opacity?: number }) {
  return (
    <group>
      <ScrollStrip xPos={-14} direction={1} lineCount={48} opacity={opacity} />
      <ScrollStrip xPos={14} direction={-1} lineCount={48} opacity={opacity} />
    </group>
  )
}
