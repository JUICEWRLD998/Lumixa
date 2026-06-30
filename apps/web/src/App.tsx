import { useEffect, useMemo, useState } from 'react';
import { useDashboard } from './hooks/useDashboard';
import { KpiStrip } from './components/KpiStrip';
import { ControlBar } from './components/ControlBar';
import { LedgerPanel } from './components/LedgerPanel';
import { VerifyPanel } from './components/VerifyPanel';
import { ProbChart } from './components/ProbChart';
import { TopologyHero } from './components/viz/TopologyHero';

const CORPUS = 'data/synthetic-777.jsonl';

export function App() {
  const { conn, state, ledger, replaying, error, startReplay, verify } = useDashboard(CORPUS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Default selection: the latest decision, so the Verify panel is never empty
  // once the agent has traded.
  useEffect(() => {
    if (selectedId && ledger.some((r) => r.id === selectedId)) return;
    const latest = ledger.at(-1);
    if (latest) setSelectedId(latest.id);
  }, [ledger, selectedId]);

  const selected = useMemo(() => ledger.find((r) => r.id === selectedId) ?? null, [ledger, selectedId]);

  // Virtual match clock = the latest timestamp the agent has observed.
  const clockMs = useMemo(() => {
    const sigTs = state?.recentSignals.at(-1)?.ts ?? 0;
    const decTs = state?.decisions.reduce((m, d) => Math.max(m, d.ourTs), 0) ?? 0;
    return Math.max(sigTs, decTs);
  }, [state]);

  const connLabel = conn === 'online' ? 'API online' : conn === 'offline' ? 'API offline' : 'connecting';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark" />
          <div>
            <div className="brand__name">Lumixa</div>
            <div className="brand__tag">proof-of-skill trading agent · World Cup 2026</div>
          </div>
        </div>

        <div className="topbar__right">
          <ControlBar conn={conn} replaying={replaying} clockMs={clockMs} corpus={CORPUS} onStart={(s) => startReplay(CORPUS, s)} />
          <span className="conn">
            <span className={`dot dot--${conn === 'online' ? 'online' : conn === 'offline' ? 'offline' : 'connecting'}`} />
            {connLabel}
          </span>
        </div>
      </header>

      {error && (
        <div className="empty" style={{ color: 'var(--neg)', flex: '0 0 auto', padding: 'var(--s-2)' }}>
          {error}
        </div>
      )}

      <main className="dashboard">
        <KpiStrip state={state} ledger={ledger} />

        <LedgerPanel rows={ledger} selectedId={selectedId} onSelect={setSelectedId} />

        <div className="hero-stack">
          <TopologyHero state={state} replaying={replaying} />
          <div className="panel chart-panel">
            <div className="panel__title">
              Price Discovery
              <span className="chart-legend">
                <span style={{ color: 'var(--viz-violet)' }}>● leader</span>
                <span style={{ color: 'var(--chain)' }}>╌ consensus</span>
              </span>
            </div>
            <div className="chart-body">
              <ProbChart signals={state?.recentSignals ?? []} />
            </div>
          </div>
        </div>

        <VerifyPanel decision={selected} onVerify={verify} />
      </main>
    </div>
  );
}
