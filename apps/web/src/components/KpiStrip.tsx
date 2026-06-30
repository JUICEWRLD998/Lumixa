import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { CountUp } from './CountUp';
import type { AgentState, LedgerRow } from '../lib/api';

interface KpiProps {
  eyebrow: string;
  accent: string;
  children: ReactNode;
  sub: ReactNode;
  index: number;
}

function Kpi({ eyebrow, accent, children, sub, index }: KpiProps) {
  return (
    <motion.div
      className="kpi"
      style={{ ['--kpi-accent' as string]: accent }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.07, ease: [0.16, 1, 0.3, 1] }}
    >
      <span className="eyebrow">{eyebrow}</span>
      <div className="kpi__value">{children}</div>
      <div className="kpi__sub">{sub}</div>
    </motion.div>
  );
}

interface KpiStripProps {
  state: AgentState | null;
  ledger: LedgerRow[];
}

/**
 * Top KPI strip — the agent's un-fakeable reputation at a glance:
 * cumulative CLV (sole academic measure of betting skill), Brier calibration,
 * on-chain proof count, and live open positions.
 */
export function KpiStrip({ state, ledger }: KpiStripProps) {
  const graded = ledger.filter((r) => r.clv !== undefined);
  const cumClvPp = graded.reduce((acc, r) => acc + (r.clv ?? 0) * 100, 0);
  const avgClvPp = graded.length > 0 ? cumClvPp / graded.length : 0;

  const briered = ledger.filter((r) => r.brier !== undefined);
  const avgBrier = briered.length > 0 ? briered.reduce((a, r) => a + (r.brier ?? 0), 0) / briered.length : undefined;

  const anchored = ledger.filter((r) => r.txSig).length;
  const verified = ledger.filter((r) => r.status === 'verified' || r.verifiedAt).length;

  const open = state?.openCount ?? 0;
  const signals = state?.recentSignals.length ?? 0;

  const clvAccent = cumClvPp >= 0 ? 'var(--pos)' : 'var(--neg)';

  return (
    <div className="kpi-strip">
      <Kpi
        index={0}
        eyebrow="Cumulative CLV"
        accent={clvAccent}
        sub={
          <span>
            avg <span className={`num ${avgClvPp >= 0 ? 'pos' : 'neg'}`}>{avgClvPp >= 0 ? '+' : ''}{avgClvPp.toFixed(2)}</span> over{' '}
            {graded.length} graded
          </span>
        }
      >
        <span className={cumClvPp >= 0 ? 'pos' : 'neg'}>
          <CountUp value={cumClvPp} decimals={2} signed />
        </span>
        <span className="kpi__unit">pp vs close</span>
      </Kpi>

      <Kpi
        index={1}
        eyebrow="Brier Score"
        accent="var(--accent-steel)"
        sub={<span>calibration · lower is better</span>}
      >
        {avgBrier === undefined ? (
          <span className="num" style={{ color: 'var(--text-dim)' }}>
            —
          </span>
        ) : (
          <CountUp value={avgBrier} decimals={3} />
        )}
      </Kpi>

      <Kpi
        index={2}
        eyebrow="On-Chain Proofs"
        accent="var(--chain)"
        sub={
          <span>
            <span className="num chain">{verified}</span> independently verified
          </span>
        }
      >
        <span className="chain">
          <CountUp value={anchored} decimals={0} />
        </span>
        <span className="kpi__unit">anchored</span>
      </Kpi>

      <Kpi
        index={3}
        eyebrow="Open Positions"
        accent={open > 0 ? 'var(--steam)' : 'var(--accent-steel)'}
        sub={
          <span>
            <span className="num">{signals}</span> signals this run
          </span>
        }
      >
        <CountUp value={open} decimals={0} />
      </Kpi>
    </div>
  );
}
