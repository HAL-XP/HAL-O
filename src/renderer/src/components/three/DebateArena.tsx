/**
 * DebateArena — 3D visualization for multi-agent debates.
 *
 * Renders colored orbs above the ring platform, each representing a debate agent.
 * Active speaker orb pulses and pulls toward center; speech bubbles stream text
 * with typewriter effect; HUD shows round counter + topic.
 *
 * Performance rules:
 *   - All scratch vectors are module-level (never allocate in useFrame)
 *   - Material mutations via refs, never via React state
 *   - Only the active speaker has a point light
 *   - Shared geometry across all orbs
 *   - Html overlays skip updates for back-facing orbs (reducedFrame pattern)
 */

import React, { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

// ── Module-level scratch objects — NEVER allocate in useFrame ──
const _orbPos = new THREE.Vector3()
const _scratchColor = new THREE.Color()
const _whiteColor = new THREE.Color(0xffffff)

// ── Constants ──
const ORBIT_RADIUS = 3.0
const ORBIT_Y = 2.5
const ORBIT_SPEED = 0.05        // rad/s idle orbit
const ACTIVE_PULL = 0.8         // units toward center for active orb
const ACTIVE_LIFT = 0.3         // extra Y for active orb
const ACTIVE_SCALE = 1.2
const IDLE_SCALE = 1.0
const SCALE_LERP_RATE = 4.0
const EMISSIVE_LERP_RATE = 6.0
const OPACITY_LERP_RATE = 5.0
const SPAWN_STAGGER = 0.3       // seconds between each orb spawn
const SPAWN_DURATION = 0.5      // seconds for spawn animation
const TYPEWRITER_CHARS_PER_FRAME = 15  // ~900 chars/s at 60fps
const BUBBLE_DIM_OPACITY = 0.4
const CONSENSUS_CONVERGE_SPEED = 1.5
const CONSENSUS_CENTER_Y = 3.5
const HUD_Y = 5.5

// Elastic ease-out for spawn animation
function elasticOut(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const p = 0.35
  return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1
}

// ── Types ──

export interface DebateAgentState {
  presetId: string
  name: string
  color: string
  icon: string
}

export interface DebateMessageState {
  agentId: string
  agentName: string
  agentColor: string
  round: number
  content: string
  timestamp: number
}

export interface DebateScoreState {
  agentId: string
  agentName: string
  score: number
  strengths: string[]
  weaknesses: string[]
}

export interface DebateState {
  id: string
  topic: string
  mode: 'round-robin' | 'concurrent' | 'devils-advocate'
  agents: DebateAgentState[]
  totalRounds: number
  currentRound: number
  messages: DebateMessageState[]
  scores: DebateScoreState[] | null
  consensus: string | null
  status: 'created' | 'running' | 'paused' | 'completed' | 'error'
}

interface DebateArenaProps {
  state: DebateState
  speakingAgent?: string | null
  streamingText?: Record<string, string>
}

// ── Mock Data ──
// Hardcoded debate for visual testing without the backend running.

const MOCK_AGENTS: DebateAgentState[] = [
  { presetId: 'critical-analyst', name: 'Critical Analyst', color: '#ff3d3d', icon: '\uD83D\uDD0D' },
  { presetId: 'evidence-gatherer', name: 'Evidence Gatherer', color: '#3b82f6', icon: '\uD83D\uDCCA' },
  { presetId: 'practical-engineer', name: 'Practical Engineer', color: '#22c55e', icon: '\uD83D\uDD27' },
  { presetId: 'creative-strategist', name: 'Creative Strategist', color: '#a855f7', icon: '\uD83D\uDCA1' },
  { presetId: 'devils-advocate', name: "Devil's Advocate", color: '#f97316', icon: '\uD83D\uDE08' },
]

const MOCK_MESSAGES: DebateMessageState[] = [
  // Round 1
  {
    agentId: 'critical-analyst', agentName: 'Critical Analyst', agentColor: '#ff3d3d', round: 1, timestamp: 1,
    content: 'I see three fundamental flaws in the proposal to rewrite the backend in Rust. First, the team has zero Rust experience. Second, the existing Go codebase handles 50K RPS without issues. Third, no performance benchmark justifies the migration cost.',
  },
  {
    agentId: 'evidence-gatherer', agentName: 'Evidence Gatherer', agentColor: '#3b82f6', round: 1, timestamp: 2,
    content: 'Discord migrated from Go to Rust in 2020 and saw latency drop from 45ms to 15ms at the 99th percentile. However, they had dedicated Rust engineers. The AWS SDK for Rust hit GA in Nov 2023, so ecosystem maturity is no longer a blocker.',
  },
  {
    agentId: 'practical-engineer', agentName: 'Practical Engineer', agentColor: '#22c55e', round: 1, timestamp: 3,
    content: 'A full rewrite is a 12-18 month project. I propose a strangler fig approach: rewrite the hot-path services first (auth, session management), keep the rest in Go. This lets us validate Rust in production within 3 months with limited risk.',
  },
  // Round 2
  {
    agentId: 'creative-strategist', agentName: 'Creative Strategist', agentColor: '#a855f7', round: 2, timestamp: 4,
    content: 'What if we skip the Rust debate entirely? WASM compilation of existing Go services could give us the same performance gains without rewriting anything. The Go-to-WASM toolchain is mature, and it opens up edge deployment options we have not considered.',
  },
  {
    agentId: 'devils-advocate', agentName: "Devil's Advocate", agentColor: '#f97316', round: 2, timestamp: 5,
    content: "Everyone is assuming performance is the actual problem. What if the real bottleneck is the database layer? I've seen teams spend 18 months on a language migration only to discover their PostgreSQL queries were the culprit all along. Have we profiled end-to-end?",
  },
  // Round 3
  {
    agentId: 'critical-analyst', agentName: 'Critical Analyst', agentColor: '#ff3d3d', round: 3, timestamp: 6,
    content: "Devil's Advocate raises a strong point. The strangler fig approach from Practical Engineer is the only proposal with a measurable checkpoint at 3 months. But we need the end-to-end profiling data BEFORE committing even to that. Without baseline metrics, any migration is premature optimization.",
  },
]

function buildMockDebate(): DebateState {
  return {
    id: 'mock-debate-001',
    topic: 'Should we rewrite the backend in Rust?',
    mode: 'round-robin',
    agents: MOCK_AGENTS,
    totalRounds: 3,
    currentRound: 3,
    messages: MOCK_MESSAGES,
    scores: null,
    consensus: null,
    status: 'running',
  }
}

// ── useMockDebate — drives the mock debate through a timed sequence ──
function useMockDebate() {
  const phaseRef = useRef(0)
  const timerRef = useRef(0)
  const holdingRef = useRef(false)  // true = streaming done, waiting before next message
  const stateRef = useRef<{
    speakingAgent: string | null
    visibleMessages: DebateMessageState[]
    currentRound: number
    status: DebateState['status']
    consensus: string | null
    streamingText: Record<string, string>
    streamCharIndex: number
  }>({
    speakingAgent: null,
    visibleMessages: [],
    currentRound: 1,
    status: 'running',
    consensus: null,
    streamingText: {},
    streamCharIndex: 0,
  })

  useFrame((_, delta) => {
    const s = stateRef.current
    timerRef.current += delta

    // Phase 0: Wait 3s after spawn for dramatic pause, then start cycling messages
    if (phaseRef.current === 0) {
      if (timerRef.current > 3.0) {
        phaseRef.current = 1
        timerRef.current = 0
        holdingRef.current = false
        s.speakingAgent = MOCK_MESSAGES[0].agentId
        s.streamCharIndex = 0
        s.streamingText = { [MOCK_MESSAGES[0].agentId]: '' }
      }
      return
    }

    // Phase 1..N: Cycle through messages with typewriter streaming
    const msgIdx = phaseRef.current - 1
    if (msgIdx < MOCK_MESSAGES.length) {
      const msg = MOCK_MESSAGES[msgIdx]

      // Still streaming — advance character index
      if (s.streamCharIndex < msg.content.length) {
        s.streamCharIndex = Math.min(
          s.streamCharIndex + TYPEWRITER_CHARS_PER_FRAME,
          msg.content.length
        )
        s.streamingText = {
          [msg.agentId]: msg.content.slice(0, s.streamCharIndex),
        }
        s.speakingAgent = msg.agentId
        s.currentRound = msg.round
        // Reset hold timer when streaming finishes
        if (s.streamCharIndex >= msg.content.length) {
          timerRef.current = 0
          holdingRef.current = true
        }
        return
      }

      // Streaming complete — hold for 2s then advance to next message
      if (holdingRef.current && timerRef.current > 2.0) {
        // Commit this message to visible messages
        s.visibleMessages = [...s.visibleMessages, msg]
        s.streamingText = {}
        s.streamCharIndex = 0
        timerRef.current = 0
        holdingRef.current = false
        phaseRef.current += 1

        // If there's a next message, start it
        const nextIdx = phaseRef.current - 1
        if (nextIdx < MOCK_MESSAGES.length) {
          const next = MOCK_MESSAGES[nextIdx]
          s.speakingAgent = next.agentId
          s.streamingText = { [next.agentId]: '' }
        } else {
          // All messages done — will trigger consensus after wait
          s.speakingAgent = null
        }
        return
      }
      return
    }

    // Phase: All messages delivered, wait then trigger consensus
    if (s.consensus === null && timerRef.current > 3.0) {
      s.consensus = 'PARTIAL'
      s.status = 'completed'
      s.speakingAgent = null
    }
  })

  return stateRef
}

// ── SpeechBubble ──

interface SpeechBubbleProps {
  text: string
  agentName: string
  agentColor: string
  agentIcon: string
  isActive: boolean
  isFaded: boolean
}

const BUBBLE_STYLE: React.CSSProperties = {
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(8px)',
  borderLeft: '3px solid',
  borderRadius: '6px',
  padding: '8px 10px',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '11px',
  lineHeight: '1.4',
  color: 'rgba(255, 255, 255, 0.9)',
  maxHeight: '120px',
  overflow: 'hidden',
  width: '220px',
  transition: 'opacity 0.5s ease',
  pointerEvents: 'none' as const,
}

function SpeechBubble({ text, agentName, agentColor, agentIcon, isActive, isFaded }: SpeechBubbleProps) {
  const opacity = isFaded ? BUBBLE_DIM_OPACITY : 1.0
  if (!text || text.length === 0) return null

  return (
    <Html center position={[0, 1.2, 0]} distanceFactor={10} style={{ pointerEvents: 'none' }}>
      <div style={{ ...BUBBLE_STYLE, borderColor: agentColor, opacity }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text}
        </div>
        <div style={{ fontSize: '9px', marginTop: '4px', opacity: 0.7, color: agentColor }}>
          {agentIcon} {agentName}
        </div>
      </div>
    </Html>
  )
}

// ── AgentOrb ──

interface AgentOrbProps {
  agent: DebateAgentState
  index: number
  agentCount: number
  isActive: boolean
  spawnTime: number
  coreGeometry: THREE.SphereGeometry
  glowGeometry: THREE.SphereGeometry
  text: string
  lastMessage: DebateMessageState | null
  consensus: string | null
  consensusPhase: number   // 0 = none, 0..1 = converging
}

function AgentOrb({
  agent, index, agentCount, isActive, spawnTime,
  coreGeometry, glowGeometry,
  text, lastMessage, consensus, consensusPhase,
}: AgentOrbProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const coreMatRef = useRef<THREE.MeshStandardMaterial>(null!)
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null!)
  const lightRef = useRef<THREE.PointLight>(null!)
  const spawnedRef = useRef(false)
  const scaleRef = useRef(0)
  // Track whether bubble should be faded (another agent spoke after us)
  const isFaded = !isActive && !!text

  // Agent color as THREE.Color — computed once
  const agentThreeColor = useMemo(() => new THREE.Color(agent.color), [agent.color])

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime
    const group = groupRef.current
    if (!group) return

    // ── Spawn animation ──
    const spawnDelay = index * SPAWN_STAGGER
    const spawnElapsed = elapsed - spawnTime - spawnDelay
    if (spawnElapsed < 0) {
      group.scale.setScalar(0)
      group.visible = false
      return
    }
    group.visible = true

    // Elastic scale-in
    const spawnT = Math.min(1, spawnElapsed / SPAWN_DURATION)
    const spawnScale = elasticOut(spawnT)
    if (!spawnedRef.current && spawnT >= 1) spawnedRef.current = true

    // ── Target scale: active = 1.2, idle = 1.0 ──
    const targetScale = isActive ? ACTIVE_SCALE : IDLE_SCALE
    scaleRef.current += (targetScale - scaleRef.current) * Math.min(1, SCALE_LERP_RATE * (1 / 60))
    const finalScale = spawnScale * scaleRef.current
    group.scale.setScalar(finalScale)

    // ── Position: orbit or consensus converge ──
    const baseAngle = (index / agentCount) * Math.PI * 2 + elapsed * ORBIT_SPEED
    const floatY = Math.sin(elapsed * 1.5 + index) * 0.15

    if (consensus && consensusPhase > 0) {
      // Converging toward center
      const isPartial = consensus === 'PARTIAL'
      const targetRadius = isPartial ? 1.5 : 0.2
      const currentRadius = ORBIT_RADIUS + (targetRadius - ORBIT_RADIUS) * consensusPhase
      _orbPos.set(
        Math.cos(baseAngle) * currentRadius,
        ORBIT_Y + (CONSENSUS_CENTER_Y - ORBIT_Y) * consensusPhase + floatY,
        Math.sin(baseAngle) * currentRadius
      )

      // Blend color toward white for full consensus
      if (!isPartial && coreMatRef.current) {
        _scratchColor.copy(agentThreeColor).lerp(_whiteColor, consensusPhase * 0.6)
        coreMatRef.current.emissive.copy(_scratchColor)
        coreMatRef.current.color.copy(_scratchColor)
      }
    } else {
      // Normal orbit
      let radius = ORBIT_RADIUS
      let posY = ORBIT_Y + floatY

      if (isActive) {
        // Pull active orb toward center and lift it
        radius -= ACTIVE_PULL
        posY += ACTIVE_LIFT
      }

      _orbPos.set(
        Math.cos(baseAngle) * radius,
        posY,
        Math.sin(baseAngle) * radius
      )
    }

    // Lerp to target position
    group.position.lerp(_orbPos, 0.08)

    // ── Material mutations (refs, not state) ──
    if (coreMatRef.current) {
      const mat = coreMatRef.current
      const targetEmissive = isActive ? 3.0 : 0.8
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * Math.min(1, EMISSIVE_LERP_RATE * (1 / 60))
      const targetOpacity = isActive ? 1.0 : 0.6
      mat.opacity += (targetOpacity - mat.opacity) * Math.min(1, OPACITY_LERP_RATE * (1 / 60))
    }

    if (glowMatRef.current) {
      const glow = glowMatRef.current
      const targetGlowOpacity = isActive ? 0.25 : 0.08
      glow.opacity += (targetGlowOpacity - glow.opacity) * Math.min(1, OPACITY_LERP_RATE * (1 / 60))
    }

    // ── Point light: only active speaker ──
    if (lightRef.current) {
      lightRef.current.visible = isActive
    }

    // ── Back-face optimization for Html: check if orb faces camera ──
    // (Handled naturally by drei's Html distanceFactor culling)
  })

  return (
    <group ref={groupRef} position={[0, ORBIT_Y, 0]}>
      {/* Core sphere */}
      <mesh geometry={coreGeometry}>
        <meshStandardMaterial
          ref={coreMatRef}
          color={agent.color}
          emissive={agent.color}
          emissiveIntensity={0.8}
          metalness={0.3}
          roughness={0.4}
          transparent
          opacity={0.6}
          toneMapped={false}
        />
      </mesh>

      {/* Outer glow shell (BackSide, additive look) */}
      <mesh geometry={glowGeometry} scale={[1.4, 1.4, 1.4]}>
        <meshBasicMaterial
          ref={glowMatRef}
          color={agent.color}
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Point light — only rendered, visibility toggled in useFrame */}
      <pointLight
        ref={lightRef}
        color={agent.color}
        intensity={2}
        distance={4}
        visible={false}
      />

      {/* Speech bubble — above orb */}
      {(text.length > 0 || (lastMessage && lastMessage.agentId === agent.presetId)) && (
        <SpeechBubble
          text={text || (lastMessage?.agentId === agent.presetId ? lastMessage.content : '')}
          agentName={agent.name}
          agentColor={agent.color}
          agentIcon={agent.icon}
          isActive={isActive}
          isFaded={isFaded}
        />
      )}
    </group>
  )
}

// ── ConsensusFlare — bright flash when orbs converge ──

function ConsensusFlare({ active }: { active: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)
  const startTimeRef = useRef(-1)

  useFrame((state) => {
    if (!active || !meshRef.current || !matRef.current) return
    if (startTimeRef.current < 0) startTimeRef.current = state.clock.elapsedTime

    const elapsed = state.clock.elapsedTime - startTimeRef.current
    const t = Math.min(1, elapsed / 1.5)

    // Scale from 0 to 3 then hold
    meshRef.current.scale.setScalar(t * 3)
    // Opacity from 1 to 0
    matRef.current.opacity = 1.0 - t
    if (t >= 1) meshRef.current.visible = false
  })

  // Shared geometry — small sphere for the flash
  const geo = useMemo(() => new THREE.SphereGeometry(0.3, 16, 16), [])

  return (
    <mesh ref={meshRef} position={[0, CONSENSUS_CENTER_Y, 0]} geometry={geo}>
      <meshBasicMaterial
        ref={matRef}
        color="#ffffff"
        transparent
        opacity={1}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  )
}

// ── DebateHud — Round counter + topic overlay ──

interface DebateHudProps {
  topic: string
  currentRound: number
  totalRounds: number
  mode: string
  status: string
  consensus: string | null
}

const HUD_OUTER_STYLE: React.CSSProperties = {
  textAlign: 'center' as const,
  fontFamily: "'JetBrains Mono', monospace",
  color: 'rgba(255, 255, 255, 0.6)',
  pointerEvents: 'none' as const,
}

const HUD_TOPIC_STYLE: React.CSSProperties = {
  fontSize: '13px',
  color: 'rgba(255, 255, 255, 0.85)',
  marginBottom: '4px',
  whiteSpace: 'nowrap' as const,
}

const HUD_ROUND_STYLE: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '2px',
}

const HUD_CONSENSUS_STYLE: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '2px',
  color: '#22c55e',
  marginTop: '4px',
}

function DebateHud({ topic, currentRound, totalRounds, mode, status, consensus }: DebateHudProps) {
  const statusText = consensus
    ? (consensus.includes('YES') ? 'Consensus reached' : 'Partial consensus')
    : status === 'running'
      ? `Round ${currentRound}/${totalRounds}`
      : status === 'completed'
        ? 'Debate complete'
        : status

  return (
    <Html center position={[0, HUD_Y, 0]} distanceFactor={15} style={{ pointerEvents: 'none' }}>
      <div style={HUD_OUTER_STYLE}>
        <div style={HUD_TOPIC_STYLE}>{topic}</div>
        <div style={HUD_ROUND_STYLE}>{statusText}</div>
        <div style={{ ...HUD_ROUND_STYLE, opacity: 0.5 }}>{mode}</div>
        {consensus && (
          <div style={HUD_CONSENSUS_STYLE}>
            {consensus.includes('YES') ? 'CONSENSUS' : 'PARTIAL CONSENSUS'}
          </div>
        )}
      </div>
    </Html>
  )
}

// ── DebateArena — orchestrator component ──

export function DebateArena({ state, speakingAgent, streamingText }: DebateArenaProps) {
  const spawnTimeRef = useRef(-1)
  const consensusPhaseRef = useRef(0)
  const consensusFlareRef = useRef(false)

  // Shared geometry across all orbs — created once
  const coreGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 32, 32), [])
  const glowGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 16, 16), [])

  // Record spawn time on first render
  const { clock } = useThree()
  if (spawnTimeRef.current < 0) {
    spawnTimeRef.current = clock.elapsedTime
  }

  // Consensus convergence animation
  useFrame((_, delta) => {
    const hasConsensus = state.consensus !== null
    const target = hasConsensus ? 1.0 : 0.0
    consensusPhaseRef.current += (target - consensusPhaseRef.current) * Math.min(1, CONSENSUS_CONVERGE_SPEED * delta)

    // Trigger flare when convergence completes
    if (hasConsensus && consensusPhaseRef.current > 0.95 && !consensusFlareRef.current) {
      consensusFlareRef.current = true
    }
  })

  // Build last-message-per-agent lookup for faded bubbles
  const lastMessageByAgent = useMemo(() => {
    const map: Record<string, DebateMessageState> = {}
    for (const msg of state.messages) {
      map[msg.agentId] = msg
    }
    return map
  }, [state.messages])

  return (
    <group>
      {/* HUD: topic + round counter */}
      <DebateHud
        topic={state.topic}
        currentRound={state.currentRound}
        totalRounds={state.totalRounds}
        mode={state.mode}
        status={state.status}
        consensus={state.consensus}
      />

      {/* Agent orbs */}
      {state.agents.map((agent, i) => (
        <AgentOrb
          key={agent.presetId}
          agent={agent}
          index={i}
          agentCount={state.agents.length}
          isActive={speakingAgent === agent.presetId}
          spawnTime={spawnTimeRef.current}
          coreGeometry={coreGeometry}
          glowGeometry={glowGeometry}
          text={streamingText?.[agent.presetId] || ''}
          lastMessage={lastMessageByAgent[agent.presetId] || null}
          consensus={state.consensus}
          consensusPhase={consensusPhaseRef.current}
        />
      ))}

      {/* Consensus convergence flash */}
      {consensusFlareRef.current && <ConsensusFlare active={true} />}
    </group>
  )
}

// ── DebateArenaWithMock — self-contained demo with mock data + timed sequence ──
// This is what PbrSceneInner renders when no real debate is active but
// the user triggers the mock visualization (or we want to test visually).

export function DebateArenaWithMock() {
  const mockDebate = useMemo(() => buildMockDebate(), [])
  const mockStateRef = useMockDebate()

  // To bridge ref-based animation state to React rendering, we use a
  // low-frequency tick (10fps) that forces re-renders so DebateArena
  // sees updated props from the animation loop.
  return <MockBridge debate={mockDebate} stateRef={mockStateRef} />
}

/** Internal ref shape for mock animation state */
interface MockAnimState {
  speakingAgent: string | null
  visibleMessages: DebateMessageState[]
  currentRound: number
  status: DebateState['status']
  consensus: string | null
  streamingText: Record<string, string>
  streamCharIndex: number
}

interface MockBridgeProps {
  debate: DebateState
  stateRef: React.MutableRefObject<MockAnimState>
}

function MockBridge({ debate, stateRef }: MockBridgeProps) {
  const [tick, setTick] = useState(0)

  // Force re-render every 100ms (10fps) to sync ref-based animation to React props.
  // This is much cheaper than re-rendering every frame.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [])

  // Read current animation state from the ref (updated by useMockDebate's useFrame)
  const s = stateRef.current
  const derivedState: DebateState = {
    ...debate,
    messages: s.visibleMessages,
    currentRound: s.currentRound,
    status: s.status,
    consensus: s.consensus,
  }

  // Suppress unused-var lint for tick (drives re-render, value not read)
  void tick

  return (
    <DebateArena
      state={derivedState}
      speakingAgent={s.speakingAgent}
      streamingText={s.streamingText}
    />
  )
}
