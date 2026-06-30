import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { LedgerRow, VerifyResult } from '../lib/api';
import { formatClv, shortHash } from '../lib/format';

interface VerifyPanelProps {
  decision: LedgerRow | null;
  onVerify: (id: string) => Promise<VerifyResult>;
}

type Phase = 'idle' | 'verifying' | 'done' | 'error';

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="M4 12.5l5 5L20 6.5"
        stroke="var(--chain-bright)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

function StatusRow({ label, ok, okText, badText, pending }: { label: string; ok: boolean; okText: string; badText: string; pending?: boolean }) {
  return (
    <div className="verify__row">
      <span className="verify__label">{label}</span>
      <span className={`verify__check ${pending ? '' : ok ? 'chain' : 'neg'}`} style={pending ? { color: 'var(--text-dim)' } : undefined}>
        {pending ? '◌' : ok ? <Check /> : '✕'} {pending ? badText : ok ? okText : badText}
      </span>
    </div>
  );
}

export function VerifyPanel({ decision, onVerify }: VerifyPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Reset when the selected decision changes.
  useEffect(() => {
    setPhase('idle');
    setResult(null);
    setErr(null);
  }, [decision?.id]);

  const run = async () => {
    if (!decision) return;
    setPhase('verifying');
    setErr(null);
    try {
      const r = await onVerify(decision.id);
      setResult(r);
      setPhase('done');
    } catch (e) {
      setErr((e as Error).message);
      setPhase('error');
    }
  };

  return (
    <div className="panel area-verify">
      <div className="panel__title">
        Verify on Solana
        <span className="count">independent re-check</span>
      </div>

      {!decision ? (
        <div className="empty">
          Select a decision in the ledger,
          <br />
          then verify it against the chain.
        </div>
      ) : (
        <>
          <div className="verify__target">
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Decision
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>
                {decision.side} <span className="num" style={{ color: 'var(--text-mid)' }}>@ {decision.price.toFixed(2)}</span>
              </span>
              <span className={`num ${(decision.clv ?? 0) >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 600 }}>
                CLV {formatClv(decision.clv)}
              </span>
            </div>
            <div className="hash" style={{ marginTop: 8 }}>
              msg {decision.messageId} · tick anchored
            </div>
          </div>

          <motion.button
            className="btn btn--chain"
            onClick={run}
            disabled={phase === 'verifying'}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
          >
            {phase === 'verifying' ? (
              <>
                <span className="spinner" /> Verifying on devnet…
              </>
            ) : phase === 'done' ? (
              <>↻ Re-verify</>
            ) : (
              <>⛓ Verify on Solana</>
            )}
          </motion.button>

          {phase === 'error' && (
            <div className="empty" style={{ color: 'var(--neg)' }}>
              {err}
            </div>
          )}

          {phase === 'done' && result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              style={{ marginTop: 'var(--s-4)' }}
            >
              <StatusRow
                label="Anchored memo"
                ok={result.memoConfirmed}
                okText="hash matches"
                badText="mismatch"
              />
              <StatusRow
                label="Odds Merkle proof"
                ok={result.merkleVerified}
                pending={!result.merkleVerified}
                okText="proof valid"
                badText="pending feed proof"
              />
              <StatusRow
                label="Score validation"
                ok={result.scoreValidation === 'verified'}
                pending={result.scoreValidation === 'pending-idl'}
                okText="validated"
                badText="pending Txoracle IDL"
              />

              <div className="verify__row">
                <span className="verify__label">Anchored hash</span>
              </div>
              <div className="hash" style={{ wordBreak: 'break-all', color: 'var(--chain)' }}>
                {result.hash}
              </div>

              <div className="verify__row" style={{ marginTop: 'var(--s-3)' }}>
                <span className="verify__label">Signature</span>
                <span className="hash">{shortHash(result.txSig)}</span>
              </div>

              {result.explorerUrl ? (
                <a className="explorer-link" href={result.explorerUrl} target="_blank" rel="noreferrer">
                  View on Solana Explorer ↗
                </a>
              ) : (
                <div className="hash" style={{ color: 'var(--text-dim)', marginTop: 4 }}>
                  offline anchor — set <span className="num">LUMIXA_ANCHOR=live</span> for a devnet tx + Explorer link
                </div>
              )}
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
