import { AnimatePresence, motion } from 'framer-motion';
import type { LedgerRow } from '../lib/api';
import { bookLabel, formatClv, formatOdds, matchClock } from '../lib/format';

interface LedgerPanelProps {
  rows: LedgerRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function statusChip(row: LedgerRow) {
  if (row.status === 'verified' || row.verifiedAt) return <span className="chip chip--verified">verified</span>;
  if (row.status === 'settled') return <span className="chip chip--settled">settled</span>;
  return <span className="chip chip--open">open</span>;
}

export function LedgerPanel({ rows, selectedId, onSelect }: LedgerPanelProps) {
  // newest first
  const ordered = [...rows].reverse();
  return (
    <div className="panel area-ledger">
      <div className="panel__title">
        Decision Ledger
        <span className="count">{rows.length} decisions</span>
      </div>
      {ordered.length === 0 ? (
        <div className="empty">
          No decisions yet.
          <br />
          Run a replay to watch the agent trade.
        </div>
      ) : (
        <div className="ledger-list">
          <AnimatePresence initial={false}>
            {ordered.map((row) => {
              const verified = row.status === 'verified' || Boolean(row.verifiedAt);
              const clvClass = (row.clv ?? 0) >= 0 ? 'pos' : 'neg';
              return (
                <motion.div
                  key={row.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="ledger-row"
                  data-verified={verified}
                  data-selected={row.id === selectedId}
                  onClick={() => onSelect(row.id)}
                >
                  <div className="ledger-row__head">
                    <span className="ledger-row__side">{row.side}</span>
                    <span className="hash" style={{ color: 'var(--text-dim)' }}>
                      @ <span className="num">{formatOdds(row.price)}</span>
                    </span>
                    {statusChip(row)}
                  </div>
                  <div className={`ledger-row__clv ${clvClass}`}>{formatClv(row.clv)}</div>
                  <div className="ledger-row__meta">
                    {bookLabel(row.leaderBook)} led · {row.market} · {matchClock(row.ourTs)}
                  </div>
                  {row.narration && <div className="ledger-row__narration">{row.narration}</div>}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
