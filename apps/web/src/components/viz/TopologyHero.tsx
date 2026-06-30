import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Line, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { AgentState } from '../../lib/api';
import { bookColor, bookLabel } from '../../lib/format';

const TEAL = '#2dd4bf';
const VIOLET = '#8b7cf6';
const STEEL = '#5b6878';

interface BookNodeData {
  bookmakerId: number;
  pct: number;
  position: THREE.Vector3;
  isLeader: boolean;
  color: string;
}

/** Distribute books on a gently tilted disc around the consensus core. */
function useNodes(state: AgentState | null): { nodes: BookNodeData[]; leaderId: number | null; consensusPct: number } {
  return useMemo(() => {
    const byBook = state?.consensus?.byBook ?? [];
    const leaderId = state?.recentSignals.at(-1)?.leaderBook ?? null;
    const consensusPct = state?.consensus?.consensusPct ?? 50;
    const sorted = [...byBook].sort((a, b) => a.bookmakerId - b.bookmakerId);
    const n = Math.max(sorted.length, 1);
    const radius = 3.4;
    const tilt = 0.32;
    const nodes: BookNodeData[] = sorted.map((b, i) => {
      const angle = (i / n) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = Math.sin(angle * 2) * tilt - (b.pct - consensusPct) * 0.04;
      const isLeader = b.bookmakerId === leaderId;
      return {
        bookmakerId: b.bookmakerId,
        pct: b.pct,
        position: new THREE.Vector3(x, y, z),
        isLeader,
        color: isLeader ? VIOLET : bookColor(b.bookmakerId),
      };
    });
    return { nodes, leaderId, consensusPct };
  }, [state]);
}

function ConsensusCore({ reduce }: { reduce: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((s) => {
    if (reduce) return;
    if (ref.current) ref.current.rotation.y += 0.003;
    if (mat.current) mat.current.emissiveIntensity = 0.55 + Math.sin(s.clock.elapsedTime * 1.6) * 0.12;
  });
  return (
    <group>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.9, 1]} />
        <meshStandardMaterial
          ref={mat}
          color="#0e1116"
          emissive={TEAL}
          emissiveIntensity={0.6}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh scale={1.18}>
        <sphereGeometry args={[0.9, 24, 24]} />
        <meshBasicMaterial color="#2a323d" wireframe transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function BookNode({ node, reduce, phase }: { node: BookNodeData; reduce: boolean; phase: number }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (reduce) return;
    const t = s.clock.elapsedTime;
    if (group.current) group.current.position.y = node.position.y + Math.sin(t * 0.8 + phase) * 0.08;
    if (node.isLeader && ring.current) {
      const k = (t % 1.6) / 1.6;
      ring.current.scale.setScalar(1 + k * 1.4);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
  });
  const r = node.isLeader ? 0.3 : 0.22;
  return (
    <group ref={group} position={node.position}>
      <mesh>
        <sphereGeometry args={[r, 24, 24]} />
        <meshStandardMaterial
          color="#0e1116"
          emissive={node.color}
          emissiveIntensity={node.isLeader ? 1.1 : 0.45}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      {node.isLeader && (
        <Billboard>
          <mesh ref={ring}>
            <ringGeometry args={[0.34, 0.4, 48]} />
            <meshBasicMaterial color={VIOLET} transparent opacity={0.5} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

/** A comet that travels the leader→core edge, re-firing on each new signal. */
function SteamComet({ from, signalKey, reduce }: { from: THREE.Vector3; signalKey: number; reduce: boolean }) {
  const head = useRef<THREE.Group>(null);
  const t = useRef(0);
  const core = useMemo(() => new THREE.Vector3(0, 0, 0), []);
  const lastKey = useRef(signalKey);
  useFrame((_, dt) => {
    if (reduce) return;
    if (lastKey.current !== signalKey) {
      lastKey.current = signalKey;
      t.current = 0;
    }
    t.current += dt * 0.7;
    if (t.current > 1) t.current = t.current % 1; // idle loop keeps the scene alive
    if (head.current) {
      const p = core.clone().lerp(from, 1 - t.current); // travel leader → core
      head.current.position.copy(p);
      const fade = Math.sin(t.current * Math.PI);
      head.current.scale.setScalar(0.6 + fade * 0.8);
      (head.current.children[0] as THREE.Mesh & { material: THREE.MeshBasicMaterial }).material.opacity = fade;
    }
  });
  return (
    <group ref={head}>
      <mesh>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#f5a623" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function ParallaxRig({ reduce }: { reduce: boolean }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    if (reduce) return;
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.04;
    camera.position.y += (1.5 + pointer.y * 0.4 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Scene({ state, reduce }: { state: AgentState | null; reduce: boolean }) {
  const { nodes, leaderId } = useNodes(state);
  const signalKey = state?.recentSignals.length ?? 0;
  const leader = nodes.find((n) => n.bookmakerId === leaderId) ?? nodes[0];

  return (
    <>
      <fog attach="fog" args={['#0a0c10', 9, 22]} />
      <ambientLight intensity={0.15} />
      <pointLight position={[0, 0, 0]} color={TEAL} intensity={6} distance={12} />
      <Stars radius={40} depth={30} count={1200} factor={3} saturation={0} fade speed={reduce ? 0 : 0.4} />

      <ConsensusCore reduce={reduce} />

      {nodes.map((node, i) => (
        <group key={node.bookmakerId}>
          <Line
            points={[node.position, new THREE.Vector3(0, 0, 0)]}
            color={node.isLeader ? VIOLET : STEEL}
            lineWidth={node.isLeader ? 1.6 : 1}
            transparent
            opacity={node.isLeader ? 0.7 : 0.4}
          />
          <BookNode node={node} reduce={reduce} phase={i * 1.7} />
        </group>
      ))}

      {leader && <SteamComet from={leader.position} signalKey={signalKey} reduce={reduce} />}

      <ParallaxRig reduce={reduce} />

      {!reduce && (
        <EffectComposer>
          <Bloom intensity={0.85} luminanceThreshold={0.55} luminanceSmoothing={0.3} mipmapBlur />
          <Vignette darkness={0.5} offset={0.4} />
        </EffectComposer>
      )}
    </>
  );
}

interface TopologyHeroProps {
  state: AgentState | null;
  replaying: boolean;
}

export function TopologyHero({ state, replaying }: TopologyHeroProps) {
  const reduce =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const books = state?.consensus?.byBook ?? [];
  const leaderId = state?.recentSignals.at(-1)?.leaderBook ?? null;

  return (
    <div className="hero-viz">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 1.5, 9], fov: 42 }}
      >
        <Scene state={state} reduce={reduce} />
      </Canvas>

      <div className="hero-overlay">
        <div className="hero-head">
          <div>
            <div className="hero-title">Market Topology</div>
            <div className="hero-sub">
              {books.length > 0
                ? `${books.length} books · price-discovery leader ${leaderId !== null ? bookLabel(leaderId) : '—'}`
                : 'Awaiting market data — run a replay'}
            </div>
          </div>
          {replaying && (
            <div className="chip chip--open" style={{ pointerEvents: 'none' }}>
              ● live replay
            </div>
          )}
        </div>

        <div className="viz-legend">
          <span className="legend-item">
            <span className="dot" style={{ background: TEAL, boxShadow: `0 0 8px ${TEAL}` }} /> Consensus core
          </span>
          <span className="legend-item">
            <span className="dot" style={{ background: VIOLET }} /> Leader book
          </span>
          <span className="legend-item">
            <span className="dot" style={{ background: '#f5a623' }} /> Steam
          </span>
        </div>
      </div>
    </div>
  );
}
