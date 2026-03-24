// ── U18 Phase 2+5: 3D Merge Conflict Graph Visualization ──
// Renders a visual representation of the merge conflict state inside the PBR scene.
// Branches as colored tubes, commits as spheres, conflicting files as glowing red/green panels.
// Phase 5: Resolution VFX — panels transition red→green on resolve, particle burst, READY TO MERGE state.

import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { MergeState, CommitNode } from '../../types/merge'

// ── Constants ──

const BRANCH_COLORS = {
  ours: new THREE.Color(0x3b82f6),   // blue
  theirs: new THREE.Color(0xa855f7), // purple
  base: new THREE.Color(0xf59e0b),   // amber
} as const

const CONFLICT_COLOR = new THREE.Color(0xef4444) // red
const CONFLICT_GLOW_COLOR = new THREE.Color(0xff2222) // bright red for emissive

// ── Phase 5: Resolution colors ──
const RESOLVED_COLOR = new THREE.Color(0x22c55e) // green
const RESOLVED_GLOW_COLOR = new THREE.Color(0x00ff66) // bright green for emissive

// Layout geometry — manual arc positioning
const GRAPH_CENTER_Y = 6    // above the HAL sphere
const GRAPH_SPREAD_X = 4.5  // horizontal spread for branches
const BRANCH_LENGTH_Y = 5   // vertical span of the branch arcs
const COMMIT_RADIUS = 0.18
const TUBE_RADIUS = 0.04
const CONFLICT_PANEL_W = 1.6
const CONFLICT_PANEL_H = 0.45
const FILE_PANEL_GAP = 0.65

// ── Branch Label ──

function BranchLabel({ position, label, color }: {
  position: [number, number, number]
  label: string
  color: string
}) {
  return (
    <Html position={position} center distanceFactor={12} zIndexRange={[100, 0]}>
      <div style={{
        background: 'rgba(0,0,0,0.75)',
        border: `1px solid ${color}`,
        borderRadius: 3,
        padding: '2px 8px',
        color,
        fontSize: 10,
        fontFamily: 'monospace',
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        userSelect: 'none',
        textShadow: `0 0 6px ${color}`,
      }}>
        {label}
      </div>
    </Html>
  )
}

// ── Phase 5: Resolution Particle Burst ──
// Short-lived particle spray emitted when a conflict file panel transitions to resolved.
// Uses an InstancedMesh with per-instance velocities + fade — self-destructs after ~1s.

const BURST_PARTICLE_COUNT = 24
const BURST_LIFETIME = 1.2 // seconds

function ResolutionParticleBurst({ position, onComplete }: {
  position: [number, number, number]
  onComplete: () => void
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const timeRef = useRef(0)

  // Generate random velocities and offsets once
  const velocities = useMemo(() => {
    const v: THREE.Vector3[] = []
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const angle = (i / BURST_PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6
      const speed = 1.5 + Math.random() * 2.0
      const ySpeed = (Math.random() - 0.3) * 2.5
      v.push(new THREE.Vector3(Math.cos(angle) * speed, ySpeed, Math.sin(angle) * speed * 0.4))
    }
    return v
  }, [])

  // Initialize transforms
  useMemo(() => {
    // Will be set in first useFrame
  }, [])

  const _dummy = useMemo(() => new THREE.Object3D(), [])
  const _color = useMemo(() => new THREE.Color(), [])

  useFrame((_, delta) => {
    timeRef.current += delta
    const t = timeRef.current
    const mesh = meshRef.current
    if (!mesh) return

    if (t >= BURST_LIFETIME) {
      onComplete()
      return
    }

    const progress = t / BURST_LIFETIME
    const fadeAlpha = 1 - progress * progress // quadratic fade

    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const vel = velocities[i]
      _dummy.position.set(
        vel.x * t * (1 - progress * 0.5),
        vel.y * t - 2.0 * t * t, // gravity
        vel.z * t * (1 - progress * 0.5),
      )
      const scale = (0.02 + Math.random() * 0.01) * fadeAlpha
      _dummy.scale.setScalar(scale)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)

      // Color: start bright green, fade to cyan
      _color.setHSL(0.38 - progress * 0.1, 1, 0.5 + fadeAlpha * 0.3)
      mesh.setColorAt(i, _color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, BURST_PARTICLE_COUNT]} position={position}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshStandardMaterial
        emissive={RESOLVED_GLOW_COLOR}
        emissiveIntensity={3.0}
        toneMapped={false}
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

// ── Commit Node — small sphere with short hash ──

function CommitSphere({ position, color, hash, isBase }: {
  position: [number, number, number]
  color: THREE.Color
  hash: string
  isBase?: boolean
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const radius = isBase ? COMMIT_RADIUS * 1.4 : COMMIT_RADIUS

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[radius, 16, 12]} />
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={isBase ? 1.2 : 0.6}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>
      <Html center distanceFactor={10} zIndexRange={[100, 0]}>
        <div style={{
          color: '#' + color.getHexString(),
          fontSize: 8,
          fontFamily: 'monospace',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: `0 0 4px #${color.getHexString()}`,
          marginTop: isBase ? 24 : 18,
        }}>
          {hash}
        </div>
      </Html>
    </group>
  )
}

// ── Branch Tube — connects commits with a curved tube ──

function BranchTube({ points, color }: {
  points: THREE.Vector3[]
  color: THREE.Color
}) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)
    return new THREE.TubeGeometry(curve, 32, TUBE_RADIUS, 8, false)
  }, [points])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.8}
        metalness={0.2}
        roughness={0.5}
        transparent
        opacity={0.85}
      />
    </mesh>
  )
}

// ── Conflict File Panel — small red glowing panel with file name ──

const SELECTED_COLOR = new THREE.Color(0xff8800) // bright amber for selected panel

function ConflictFilePanel({ position, fileName, chunkCount, selected, resolved, onClick }: {
  position: [number, number, number]
  fileName: string
  chunkCount: number
  selected?: boolean
  resolved?: boolean
  onClick?: () => void
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const edgeMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const timeRef = useRef(Math.random() * Math.PI * 2) // phase offset for pulsing
  // Phase 5: Smooth color transition tracking (0 = red/conflict, 1 = green/resolved)
  const resolveProgress = useRef(resolved ? 1 : 0)

  // When selected, brighten the glow color; when resolved, use green
  const edgeColor = resolved ? RESOLVED_GLOW_COLOR : selected ? SELECTED_COLOR : CONFLICT_GLOW_COLOR
  const faceEmissive = resolved ? RESOLVED_COLOR : selected ? SELECTED_COLOR : CONFLICT_COLOR

  useFrame((_, delta) => {
    // Phase 5: Animate resolve progress (500ms transition)
    const targetProgress = resolved ? 1 : 0
    if (resolveProgress.current !== targetProgress) {
      resolveProgress.current += (targetProgress - resolveProgress.current) * Math.min(1, delta * 4)
      if (Math.abs(resolveProgress.current - targetProgress) < 0.01) resolveProgress.current = targetProgress
    }
    const rp = resolveProgress.current

    timeRef.current += delta * (resolved ? 1.5 : selected ? 3.5 : 2.5)
    const pulse = 0.5 + 0.5 * Math.sin(timeRef.current)
    const baseIntensity = resolved ? 0.4 + pulse * 0.3 : selected ? 1.2 + pulse * 0.8 : 0.6 + pulse * 1.0

    if (matRef.current) {
      matRef.current.emissiveIntensity = baseIntensity * (resolved ? 0.4 : selected ? 0.6 : 0.3)
      matRef.current.opacity = resolved ? 0.5 + pulse * 0.1 : selected ? 0.9 + pulse * 0.1 : 0.7 + pulse * 0.2
      // Lerp emissive color between red and green
      const c = matRef.current.emissive
      c.lerpColors(CONFLICT_COLOR, RESOLVED_COLOR, rp)
    }
    if (edgeMatRef.current) {
      edgeMatRef.current.emissiveIntensity = baseIntensity * (resolved ? 0.8 : selected ? 1.6 : 1.0)
      const c = edgeMatRef.current.emissive
      c.lerpColors(CONFLICT_GLOW_COLOR, RESOLVED_GLOW_COLOR, rp)
      edgeMatRef.current.color.copy(c)
    }
  })

  // Truncate long file paths — show only the last 2 path segments
  const shortName = useMemo(() => {
    const parts = fileName.replace(/\\/g, '/').split('/')
    if (parts.length <= 2) return fileName
    return '.../' + parts.slice(-2).join('/')
  }, [fileName])

  return (
    <group position={position}>
      {/* Clickable hit area — slightly larger than the panel for easier clicks */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onClick?.() }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = onClick ? 'pointer' : 'default' }}
        onPointerOut={() => { document.body.style.cursor = 'default' }}
      >
        <planeGeometry args={[CONFLICT_PANEL_W + 0.1, CONFLICT_PANEL_H + 0.1]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Face */}
      <mesh>
        <planeGeometry args={[CONFLICT_PANEL_W, CONFLICT_PANEL_H]} />
        <meshStandardMaterial
          ref={matRef}
          color={resolved ? '#001a0a' : selected ? '#1a0a00' : '#1a0000'}
          emissive={faceEmissive}
          emissiveIntensity={0.5}
          metalness={0.1}
          roughness={0.6}
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Top edge glow */}
      <mesh position={[0, CONFLICT_PANEL_H / 2, 0.001]}>
        <planeGeometry args={[CONFLICT_PANEL_W, 0.02]} />
        <meshStandardMaterial
          ref={edgeMatRef}
          color={edgeColor}
          emissive={edgeColor}
          emissiveIntensity={1.2}
        />
      </mesh>
      {/* Bottom edge glow */}
      <mesh position={[0, -CONFLICT_PANEL_H / 2, 0.001]}>
        <planeGeometry args={[CONFLICT_PANEL_W, 0.02]} />
        <meshStandardMaterial
          color={edgeColor}
          emissive={edgeColor}
          emissiveIntensity={1.2}
        />
      </mesh>
      {/* Left edge glow */}
      <mesh position={[-CONFLICT_PANEL_W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, CONFLICT_PANEL_H]} />
        <meshStandardMaterial
          color={edgeColor}
          emissive={edgeColor}
          emissiveIntensity={1.2}
        />
      </mesh>
      {/* Right edge glow */}
      <mesh position={[CONFLICT_PANEL_W / 2, 0, 0.001]}>
        <planeGeometry args={[0.02, CONFLICT_PANEL_H]} />
        <meshStandardMaterial
          color={edgeColor}
          emissive={edgeColor}
          emissiveIntensity={1.2}
        />
      </mesh>

      {/* File name label */}
      <Html center distanceFactor={10} zIndexRange={[100, 0]}>
        <div
          onClick={(e) => { e.stopPropagation(); onClick?.() }}
          style={{
            color: resolved ? '#4ade80' : selected ? '#ffaa44' : '#ff6b6b',
            fontSize: 9,
            fontFamily: 'monospace',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: onClick ? 'auto' : 'none',
            userSelect: 'none',
            cursor: onClick ? 'pointer' : 'default',
            textShadow: resolved ? '0 0 8px #22c55e' : selected ? '0 0 8px #ff8800' : '0 0 6px #ef4444',
            lineHeight: 1.3,
            textAlign: 'center',
            textDecoration: resolved ? 'line-through' : 'none',
            opacity: resolved ? 0.7 : 1,
            transition: 'opacity 0.5s, color 0.5s',
          }}>
          <div>{resolved ? '\u2714 ' : ''}{shortName}</div>
          <div style={{
            fontSize: 7,
            color: resolved ? '#86efac' : selected ? '#ffcc88' : '#ff9999',
            opacity: 0.8,
          }}>
            {resolved
              ? 'RESOLVED'
              : `${chunkCount} conflict${chunkCount !== 1 ? 's' : ''}${selected ? ' \u2014 CLICK TO VIEW' : ''}`
            }
          </div>
        </div>
      </Html>
    </group>
  )
}

// ── Merge Base Diamond — amber marker at the fork point ──

function MergeBaseDiamond({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.8
    }
  })

  return (
    <mesh ref={meshRef} position={position} rotation={[0, 0, Math.PI / 4]}>
      <octahedronGeometry args={[0.25, 0]} />
      <meshStandardMaterial
        color={BRANCH_COLORS.base}
        emissive={BRANCH_COLORS.base}
        emissiveIntensity={1.0}
        metalness={0.4}
        roughness={0.3}
        transparent
        opacity={0.9}
      />
    </mesh>
  )
}

// ── Connection Lines — dashed lines from conflict files to both branches ──

function ConflictConnectionLine({ from, to, color }: {
  from: [number, number, number]
  to: [number, number, number]
  color: THREE.Color
}) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([...from, ...to], 3))
    return g
  }, [from, to])

  return (
    <line geometry={geo}>
      <lineDashedMaterial
        color={color}
        dashSize={0.15}
        gapSize={0.1}
        transparent
        opacity={0.35}
      />
    </line>
  )
}

// ── HUD Banner — "MERGE CONFLICTS" overlay text ──

function MergeHudBanner({ position, mergeType, conflictCount, ourBranch, theirBranch }: {
  position: [number, number, number]
  mergeType: string
  conflictCount: number
  ourBranch: string
  theirBranch: string
}) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const timeRef = useRef(0)

  useFrame((_, delta) => {
    timeRef.current += delta
    if (matRef.current) {
      const pulse = 0.7 + 0.3 * Math.sin(timeRef.current * 3)
      matRef.current.emissiveIntensity = pulse
    }
  })

  return (
    <group position={position}>
      {/* Background bar */}
      <mesh>
        <planeGeometry args={[6, 0.5]} />
        <meshStandardMaterial
          ref={matRef}
          color="#1a0000"
          emissive={CONFLICT_COLOR}
          emissiveIntensity={0.8}
          metalness={0.1}
          roughness={0.7}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Html center distanceFactor={12} zIndexRange={[200, 0]}>
        <div style={{
          color: '#ff4444',
          fontSize: 13,
          fontFamily: 'monospace',
          fontWeight: 800,
          letterSpacing: 3,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: '0 0 10px #ff0000, 0 0 20px #ff000066',
          textTransform: 'uppercase',
          lineHeight: 1.2,
          textAlign: 'center',
        }}>
          <div>{mergeType === 'merge' ? 'MERGE' : mergeType === 'rebase' ? 'REBASE' : 'CHERRY-PICK'} CONFLICTS</div>
          <div style={{ fontSize: 8, color: '#ff8888', letterSpacing: 1, marginTop: 2 }}>
            {conflictCount} file{conflictCount !== 1 ? 's' : ''} &middot; {ourBranch} &#x2190; {theirBranch}
          </div>
        </div>
      </Html>
    </group>
  )
}

// ── Phase 5: READY TO MERGE Banner — pulsing green overlay ──

function ReadyToMergeBanner({ position }: { position: [number, number, number] }) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const timeRef = useRef(0)

  useFrame((_, delta) => {
    timeRef.current += delta
    if (matRef.current) {
      const pulse = 0.6 + 0.4 * Math.sin(timeRef.current * 2.5)
      matRef.current.emissiveIntensity = pulse
      matRef.current.opacity = 0.5 + pulse * 0.2
    }
  })

  return (
    <group position={position}>
      {/* Background bar */}
      <mesh>
        <planeGeometry args={[5, 0.55]} />
        <meshStandardMaterial
          ref={matRef}
          color="#001a0a"
          emissive={RESOLVED_COLOR}
          emissiveIntensity={0.7}
          metalness={0.1}
          roughness={0.7}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Html center distanceFactor={12} zIndexRange={[200, 0]}>
        <div style={{
          color: '#4ade80',
          fontSize: 14,
          fontFamily: 'monospace',
          fontWeight: 800,
          letterSpacing: 4,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          userSelect: 'none',
          textShadow: '0 0 12px #22c55e, 0 0 24px #22c55e44',
          textTransform: 'uppercase',
          lineHeight: 1.2,
          textAlign: 'center',
        }}>
          <div>READY TO MERGE</div>
          <div style={{ fontSize: 8, color: '#86efac', letterSpacing: 1, marginTop: 2, fontWeight: 600 }}>
            ALL CONFLICTS RESOLVED
          </div>
        </div>
      </Html>
    </group>
  )
}

// ── Main MergeGraph Component ──

interface MergeGraphProps {
  mergeState: MergeState
  commitGraph: CommitNode[]
  /** Y offset — base position above the HAL sphere */
  baseY?: number
  /** Currently selected conflict file path (highlighted in the graph) */
  selectedFile?: string | null
  /** Called when user clicks a conflict file panel in the 3D graph */
  onSelectFile?: (filePath: string) => void
  /** Phase 5: Set of file paths that have been resolved (triggers green transition + particle burst) */
  resolvedFiles?: Set<string>
  /** Phase 5: True when all conflicts are resolved — shows READY TO MERGE overlay */
  allResolved?: boolean
}

/**
 * 3D merge conflict graph visualization.
 *
 * Layout (manual arc, no force simulation):
 * - "Ours" branch arcs to the left (blue)
 * - "Theirs" branch arcs to the right (purple)
 * - Merge base diamond at the bottom center
 * - Conflict files float between the branches (red glow, pulsing)
 * - HUD banner at the top: "MERGE CONFLICTS"
 */
export function MergeGraph({ mergeState, commitGraph, baseY = GRAPH_CENTER_Y, selectedFile, onSelectFile, resolvedFiles, allResolved = false }: MergeGraphProps) {
  const groupRef = useRef<THREE.Group>(null)
  const fadeRef = useRef(0)
  // Phase 5: Track active particle bursts by file path
  const [activeBursts, setActiveBursts] = useState<Set<string>>(new Set())
  // Phase 5: Track which files we've already seen as resolved (to trigger burst only once)
  const seenResolvedRef = useRef<Set<string>>(new Set())

  // Phase 5: Detect newly resolved files and trigger particle bursts
  const resolvedSet = resolvedFiles ?? new Set<string>()
  const newlyResolved: string[] = []
  for (const fp of resolvedSet) {
    if (!seenResolvedRef.current.has(fp)) {
      newlyResolved.push(fp)
    }
  }
  if (newlyResolved.length > 0) {
    // Update seen set synchronously (refs don't trigger re-render)
    for (const fp of newlyResolved) seenResolvedRef.current.add(fp)
    // Schedule burst spawn (state update triggers re-render)
    if (newlyResolved.some(fp => !activeBursts.has(fp))) {
      // Use microtask to avoid setState-during-render
      Promise.resolve().then(() => {
        setActiveBursts(prev => {
          const next = new Set(prev)
          for (const fp of newlyResolved) next.add(fp)
          return next
        })
      })
    }
  }

  // Phase 5: Dim the whole graph when all resolved
  const dimTarget = allResolved ? 0.5 : 1.0

  // Fade in on mount
  useFrame((_, delta) => {
    fadeRef.current = Math.min(1, fadeRef.current + delta * 2)
    if (groupRef.current) {
      // Phase 5: Lerp scale toward dim target when all resolved
      const targetScale = fadeRef.current * dimTarget
      const current = groupRef.current.scale.x
      const lerped = current + (targetScale - current) * Math.min(1, delta * 3)
      groupRef.current.scale.setScalar(lerped)
      // Gentle float
      groupRef.current.position.y = baseY + Math.sin(Date.now() * 0.001) * 0.08
    }
  })

  // Partition commits into ours/theirs branches using refs + parent structure
  const { oursCommits, theirsCommits, oursPositions, theirsPositions, basePosition } = useMemo(() => {
    // Find commits that belong to each branch by checking refs
    const ourBranch = mergeState.ourBranch
    const theirBranch = mergeState.theirBranch

    // Strategy: look for commits with matching ref labels.
    // If no refs match (common), split the graph by structure:
    // commits with multiple parents are merge commits.
    // Fallback: first half = ours, second half = theirs.

    let oursNodes: CommitNode[] = []
    let theirsNodes: CommitNode[] = []
    let baseNode: CommitNode | null = null

    if (commitGraph.length === 0) {
      // No commits — create synthetic nodes from branch names
      oursNodes = [{ hash: '0000001', shortHash: ourBranch.slice(0, 7) || 'HEAD', subject: ourBranch, author: '', timestamp: 0, parents: [], refs: [ourBranch] }]
      theirsNodes = [{ hash: '0000002', shortHash: theirBranch.slice(0, 7) || 'THEIRS', subject: theirBranch, author: '', timestamp: 0, parents: [], refs: [theirBranch] }]
    } else {
      // Try to find commits with refs matching our branch / their branch
      const oursRefSet = new Set<string>()
      const theirsRefSet = new Set<string>()

      for (const c of commitGraph) {
        const refsLower = c.refs.map(r => r.toLowerCase())
        if (refsLower.some(r => r.includes(ourBranch.toLowerCase()) || r.includes('head'))) {
          oursRefSet.add(c.hash)
        }
        if (refsLower.some(r => r.includes(theirBranch.toLowerCase()))) {
          theirsRefSet.add(c.hash)
        }
      }

      // Walk parents to fill branch sets
      const visited = new Set<string>()
      const hashMap = new Map(commitGraph.map(c => [c.hash, c]))

      function walkBranch(startHashes: Set<string>, target: CommitNode[]) {
        const queue = [...startHashes]
        while (queue.length > 0) {
          const h = queue.shift()!
          if (visited.has(h)) continue
          visited.add(h)
          const node = hashMap.get(h)
          if (node) {
            target.push(node)
            // Stop at 5 commits per branch to keep the visualization clean
            if (target.length >= 5) break
            for (const p of node.parents) {
              if (!visited.has(p)) queue.push(p)
            }
          }
        }
      }

      if (oursRefSet.size > 0) walkBranch(oursRefSet, oursNodes)
      if (theirsRefSet.size > 0) walkBranch(theirsRefSet, theirsNodes)

      // Fallback: if we couldn't determine branches, just split the graph
      if (oursNodes.length === 0 && theirsNodes.length === 0) {
        const mid = Math.ceil(commitGraph.length / 2)
        oursNodes = commitGraph.slice(0, Math.min(mid, 5))
        theirsNodes = commitGraph.slice(mid, Math.min(mid + 5, commitGraph.length))
      } else if (oursNodes.length === 0) {
        oursNodes = commitGraph.filter(c => !theirsNodes.includes(c)).slice(0, 5)
      } else if (theirsNodes.length === 0) {
        theirsNodes = commitGraph.filter(c => !oursNodes.includes(c)).slice(0, 5)
      }

      // Find base commit: the last commit in ours that shares a parent with theirs
      const oursHashes = new Set(oursNodes.map(c => c.hash))
      const theirsHashes = new Set(theirsNodes.map(c => c.hash))
      for (const c of commitGraph) {
        if (oursHashes.has(c.hash) && theirsHashes.has(c.hash)) {
          baseNode = c
          break
        }
      }
      // If no shared commit, use the oldest commit
      if (!baseNode && commitGraph.length > 0) {
        baseNode = commitGraph[commitGraph.length - 1]
      }
    }

    // Compute positions along arcs
    const oursCount = Math.max(oursNodes.length, 1)
    const theirsCount = Math.max(theirsNodes.length, 1)

    // Ours branch: arcs left, bottom to top
    const op: [number, number, number][] = oursNodes.map((_, i) => {
      const t = (i + 1) / (oursCount + 1)
      const x = -GRAPH_SPREAD_X * Math.sin(t * Math.PI * 0.5)
      const y = t * BRANCH_LENGTH_Y
      const z = -Math.sin(t * Math.PI) * 0.8 // subtle z curve
      return [x, y, z]
    })

    // Theirs branch: arcs right, bottom to top
    const tp: [number, number, number][] = theirsNodes.map((_, i) => {
      const t = (i + 1) / (theirsCount + 1)
      const x = GRAPH_SPREAD_X * Math.sin(t * Math.PI * 0.5)
      const y = t * BRANCH_LENGTH_Y
      const z = -Math.sin(t * Math.PI) * 0.8
      return [x, y, z]
    })

    const bp: [number, number, number] = [0, -0.3, 0]

    return {
      oursCommits: oursNodes,
      theirsCommits: theirsNodes,
      baseCommit: baseNode,
      oursPositions: op,
      theirsPositions: tp,
      basePosition: bp,
    }
  }, [mergeState, commitGraph])

  // Build tube paths
  const oursTubePoints = useMemo(() => {
    const pts: THREE.Vector3[] = [new THREE.Vector3(...basePosition)]
    for (const p of oursPositions) pts.push(new THREE.Vector3(...p))
    return pts
  }, [oursPositions, basePosition])

  const theirsTubePoints = useMemo(() => {
    const pts: THREE.Vector3[] = [new THREE.Vector3(...basePosition)]
    for (const p of theirsPositions) pts.push(new THREE.Vector3(...p))
    return pts
  }, [theirsPositions, basePosition])

  // Layout conflict files in a vertical stack between the branches
  const conflictPositions = useMemo((): [number, number, number][] => {
    const files = mergeState.conflictFiles
    if (files.length === 0) return []
    const count = Math.min(files.length, 8) // cap at 8 visible panels
    const totalHeight = (count - 1) * FILE_PANEL_GAP
    const startY = BRANCH_LENGTH_Y * 0.3 - totalHeight / 2
    return files.slice(0, count).map((_, i) => {
      const y = startY + i * FILE_PANEL_GAP
      const x = Math.sin(i * 0.4) * 0.3 // slight zigzag
      return [x, y, 0.5]
    })
  }, [mergeState.conflictFiles])

  // Determine top label positions for the branches
  const oursLabelPos: [number, number, number] = oursPositions.length > 0
    ? [oursPositions[oursPositions.length - 1][0], oursPositions[oursPositions.length - 1][1] + 0.5, oursPositions[oursPositions.length - 1][2]]
    : [-GRAPH_SPREAD_X, BRANCH_LENGTH_Y * 0.7, 0]

  const theirsLabelPos: [number, number, number] = theirsPositions.length > 0
    ? [theirsPositions[theirsPositions.length - 1][0], theirsPositions[theirsPositions.length - 1][1] + 0.5, theirsPositions[theirsPositions.length - 1][2]]
    : [GRAPH_SPREAD_X, BRANCH_LENGTH_Y * 0.7, 0]

  return (
    <group ref={groupRef} position={[0, baseY, 0]}>
      {/* HUD Banner at top */}
      <MergeHudBanner
        position={[0, BRANCH_LENGTH_Y + 1.0, 0]}
        mergeType={mergeState.mergeType}
        conflictCount={mergeState.conflictFiles.length}
        ourBranch={mergeState.ourBranch}
        theirBranch={mergeState.theirBranch}
      />

      {/* Branch labels */}
      <BranchLabel position={oursLabelPos} label={mergeState.ourBranch || 'ours'} color="#3b82f6" />
      <BranchLabel position={theirsLabelPos} label={mergeState.theirBranch || 'theirs'} color="#a855f7" />

      {/* Branch tubes */}
      <BranchTube points={oursTubePoints} color={BRANCH_COLORS.ours} />
      <BranchTube points={theirsTubePoints} color={BRANCH_COLORS.theirs} />

      {/* Merge base diamond */}
      <MergeBaseDiamond position={basePosition} />
      <BranchLabel position={[basePosition[0], basePosition[1] - 0.5, basePosition[2]]} label="base" color="#f59e0b" />

      {/* Ours commit nodes */}
      {oursCommits.map((c, i) => oursPositions[i] && (
        <CommitSphere
          key={`ours-${c.hash}`}
          position={oursPositions[i]}
          color={BRANCH_COLORS.ours}
          hash={c.shortHash}
        />
      ))}

      {/* Theirs commit nodes */}
      {theirsCommits.map((c, i) => theirsPositions[i] && (
        <CommitSphere
          key={`theirs-${c.hash}`}
          position={theirsPositions[i]}
          color={BRANCH_COLORS.theirs}
          hash={c.shortHash}
        />
      ))}

      {/* Conflict file panels — clickable to open ConflictViewer */}
      {mergeState.conflictFiles.slice(0, 8).map((file, i) => conflictPositions[i] && (
        <ConflictFilePanel
          key={file.path}
          position={conflictPositions[i]}
          fileName={file.path}
          chunkCount={file.chunks.length}
          selected={selectedFile === file.path}
          resolved={resolvedSet.has(file.path)}
          onClick={onSelectFile ? () => onSelectFile(file.path) : undefined}
        />
      ))}

      {/* Phase 5: Resolution particle bursts */}
      {mergeState.conflictFiles.slice(0, 8).map((file, i) => {
        if (!activeBursts.has(file.path) || !conflictPositions[i]) return null
        return (
          <ResolutionParticleBurst
            key={`burst-${file.path}`}
            position={conflictPositions[i]}
            onComplete={() => {
              setActiveBursts(prev => {
                const next = new Set(prev)
                next.delete(file.path)
                return next
              })
            }}
          />
        )
      })}

      {/* Overflow indicator when there are more than 8 conflict files */}
      {mergeState.conflictFiles.length > 8 && (
        <Html
          position={[0, conflictPositions[conflictPositions.length - 1]?.[1] - 0.6 ?? 0, 0.5]}
          center
          distanceFactor={10}
          zIndexRange={[100, 0]}
        >
          <div style={{
            color: '#ff8888',
            fontSize: 8,
            fontFamily: 'monospace',
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            +{mergeState.conflictFiles.length - 8} more files
          </div>
        </Html>
      )}

      {/* Dashed lines connecting conflict files to both branches */}
      {conflictPositions.map((pos, i) => {
        // Connect to nearest ours and theirs commit
        const oursTarget = oursPositions[Math.min(i, oursPositions.length - 1)] || [-GRAPH_SPREAD_X, BRANCH_LENGTH_Y * 0.5, 0] as [number, number, number]
        const theirsTarget = theirsPositions[Math.min(i, theirsPositions.length - 1)] || [GRAPH_SPREAD_X, BRANCH_LENGTH_Y * 0.5, 0] as [number, number, number]
        return (
          <group key={`conn-${i}`}>
            <ConflictConnectionLine from={pos} to={oursTarget} color={BRANCH_COLORS.ours} />
            <ConflictConnectionLine from={pos} to={theirsTarget} color={BRANCH_COLORS.theirs} />
          </group>
        )
      })}

      {/* Ambient point light — red when conflicts, green when all resolved */}
      <pointLight
        position={[0, BRANCH_LENGTH_Y * 0.4, 2]}
        color={allResolved ? RESOLVED_COLOR : CONFLICT_COLOR}
        intensity={allResolved ? 1.2 : 0.8}
        distance={10}
        decay={2}
      />

      {/* Phase 5: READY TO MERGE overlay when all conflicts resolved */}
      {allResolved && (
        <ReadyToMergeBanner position={[0, BRANCH_LENGTH_Y * 0.5, 1.2]} />
      )}
    </group>
  )
}
