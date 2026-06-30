import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ConnState } from '../hooks/useDashboard';
import { matchClock } from '../lib/format';

const SPEEDS: { label: string; value: number | undefined }[] = [
  { label: 'Cinematic 12×', value: 12 },
  { label: 'Fast 40×', value: 40 },
  { label: 'Instant', value: undefined },
];

interface ControlBarProps {
  conn: ConnState;
  replaying: boolean;
  clockMs: number;
  corpus: string;
  onStart: (speed?: number) => void;
}

export function ControlBar({ conn, replaying, clockMs, corpus, onStart }: ControlBarProps) {
  const [speedIdx, setSpeedIdx] = useState(0);

  return (
    <div className="controls">
      <span className="match-clock">
        <span className="eyebrow" style={{ color: 'var(--text-faint)' }}>
          CLOCK
        </span>
        {matchClock(clockMs)}
      </span>

      <div className="seg" role="group" aria-label="Replay speed">
        {SPEEDS.map((s, i) => (
          <button key={s.label} data-active={i === speedIdx} onClick={() => setSpeedIdx(i)} disabled={replaying}>
            {s.label}
          </button>
        ))}
      </div>

      <motion.button
        className="btn btn--chain"
        style={{ width: 'auto' }}
        disabled={replaying || conn === 'offline'}
        onClick={() => onStart(SPEEDS[speedIdx]?.value)}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        title={`Replay ${corpus}`}
      >
        {replaying ? (
          <>
            <span className="spinner" /> Trading…
          </>
        ) : (
          <>▶ Run replay</>
        )}
      </motion.button>
    </div>
  );
}
