import { useEffect } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

interface CountUpProps {
  value: number;
  /** decimals to render */
  decimals?: number;
  /** prepend a `+` for positive values (CLV-style) */
  signed?: boolean;
  duration?: number;
}

/**
 * Smoothly counts to `value` with tabular formatting. The sign/colour is the
 * caller's concern (resolved before the count so the number never flips colour
 * mid-animation). Respects reduced-motion by snapping to the final value.
 */
export function CountUp({ value, decimals = 2, signed = false, duration = 1.1 }: CountUpProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, duration, mv, reduce]);

  const text = display.toFixed(decimals);
  const sign = signed && display >= 0 ? '+' : '';
  return (
    <span className="num">
      {sign}
      {text}
    </span>
  );
}
