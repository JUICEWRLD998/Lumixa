/*
 * Typed client for the Lumixa API. Types mirror the real server payloads
 * captured from `@lumixa/server` (agent.ts `AgentState`, prover `VerifyResult`,
 * core `Decision`). In dev, requests go to `/api/*` (Vite proxy → backend); set
 * `VITE_API_BASE` to an absolute origin for a deployed build.
 */

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');

export type DecisionStatus = 'open' | 'settled' | 'verified';

export interface Decision {
  id: string;
  messageId: string;
  fixtureId: number;
  market: string;
  side: string;
  price: number;
  entryPct: number;
  ourTs: number;
  leaderBook: number;
  stake: number;
  status: DecisionStatus;
  proofRef?: string;
  txSig?: string;
  closingPct?: number;
  clv?: number;
  brier?: number;
}

export interface LedgerRow extends Decision {
  narration?: string;
  verifiedAt?: number;
  scoreValidation?: 'pending-idl' | 'verified' | 'failed';
}

export interface SteamMove {
  bookmakerId: number;
  market: string;
  outcome: string;
  fromPct: number;
  toPct: number;
  delta: number;
  direction: number;
  windowStartTs: number;
  ts: number;
}

export interface Signal {
  fixtureId: number;
  market: string;
  outcome: string;
  leaderBook: number;
  leaderPct: number;
  consensusPct: number;
  entryPrice: number;
  leadLag: { corr: number; lagSteps: number };
  steam: SteamMove;
  messageId: string;
  ts: number;
}

export interface OutcomeKey {
  fixtureId: number;
  market: string;
  outcome: string;
}

export interface ConsensusSnapshot {
  key: OutcomeKey;
  consensusPct?: number;
  byBook: { bookmakerId: number; pct: number }[];
}

export interface AgentState {
  decisions: Decision[];
  openCount: number;
  recentSignals: Signal[];
  consensus?: ConsensusSnapshot;
}

export interface LedgerResponse {
  count: number;
  decisions: LedgerRow[];
}

export interface VerifyResult {
  decisionId: string;
  hash: string;
  merkleVerified: boolean;
  memoConfirmed: boolean;
  txSig?: string;
  explorerUrl?: string;
  clv?: number;
  brier?: number;
  scoreValidation: 'pending-idl' | 'verified' | 'failed';
}

export interface ReplayResult {
  started: boolean;
  events: number;
  decisions: number;
  settled: number;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${res.statusText} ${detail}`.trim());
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => getJson<{ ok: boolean; service: string }>('/health'),
  state: () => getJson<AgentState>('/state'),
  ledger: () => getJson<LedgerResponse>('/ledger'),
  verify: (id: string) => getJson<VerifyResult>(`/verify/${encodeURIComponent(id)}`),
  startReplay: (match: string, speed?: number) =>
    getJson<ReplayResult>('/replay/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(speed === undefined ? { match } : { match, speed }),
    }),
};
