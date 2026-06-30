import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AgentState, type LedgerRow, type VerifyResult } from '../lib/api';

export type ConnState = 'connecting' | 'online' | 'offline';

export interface DashboardModel {
  conn: ConnState;
  state: AgentState | null;
  ledger: LedgerRow[];
  /** true while a replay run is in flight (POST /replay/start not yet resolved) */
  replaying: boolean;
  lastRun: { events: number; decisions: number; settled: number } | null;
  error: string | null;
  startReplay: (match: string, speed?: number) => Promise<void>;
  verify: (id: string) => Promise<VerifyResult>;
}

const DEFAULT_CORPUS = 'data/synthetic-777.jsonl';

/**
 * Single source of truth for the dashboard: polls `/state` + `/ledger` and
 * drives `/replay/start`. Poll cadence tightens while a replay is running so the
 * agent's positions/signals animate in near-real-time.
 */
export function useDashboard(corpus: string = DEFAULT_CORPUS): DashboardModel {
  const [conn, setConn] = useState<ConnState>('connecting');
  const [state, setState] = useState<AgentState | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [lastRun, setLastRun] = useState<DashboardModel['lastRun']>(null);
  const [error, setError] = useState<string | null>(null);

  const replayingRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api.state(), api.ledger()]);
      setState(s);
      setLedger(l.decisions);
      setConn('online');
    } catch {
      setConn('offline');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (!alive) return;
      await poll();
      if (!alive) return;
      timer = setTimeout(loop, replayingRef.current ? 450 : 2000);
    };
    void loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [poll]);

  const startReplay = useCallback(
    async (match: string, speed?: number) => {
      setError(null);
      setReplaying(true);
      replayingRef.current = true;
      try {
        const res = await api.startReplay(match, speed);
        setLastRun({ events: res.events, decisions: res.decisions, settled: res.settled });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setReplaying(false);
        replayingRef.current = false;
        await poll();
      }
    },
    [poll],
  );

  const verify = useCallback(async (id: string) => {
    const result = await api.verify(id);
    // Reflect the fresh verification in the local ledger row immediately.
    setLedger((rows) =>
      rows.map((r) =>
        r.id === id
          ? { ...r, status: result.memoConfirmed ? ('verified' as const) : r.status, clv: result.clv ?? r.clv }
          : r,
      ),
    );
    return result;
  }, []);

  // expose the configured corpus default via a stable closure
  useEffect(() => {
    if (corpus !== DEFAULT_CORPUS) void poll();
  }, [corpus, poll]);

  return { conn, state, ledger, replaying, lastRun, error, startReplay, verify };
}
