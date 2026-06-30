import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Signal } from '../lib/api';
import { matchClock } from '../lib/format';

interface ProbChartProps {
  signals: Signal[];
}

interface Point {
  t: string;
  leader: number;
  consensus: number;
}

/**
 * The price-discovery story in one chart: the leader book's demargined
 * probability pulling ahead while the consensus (median) still lags — the gap
 * the agent trades. Built from the fired-signal stream.
 */
export function ProbChart({ signals }: ProbChartProps) {
  const data: Point[] = signals.map((s) => ({
    t: matchClock(s.ts),
    leader: Number(s.leaderPct.toFixed(2)),
    consensus: Number(s.consensusPct.toFixed(2)),
  }));

  if (data.length === 0) {
    return <div className="empty">Probability lines appear as signals fire.</div>;
  }

  const lo = Math.floor(Math.min(...data.flatMap((d) => [d.leader, d.consensus])) - 2);
  const hi = Math.ceil(Math.max(...data.flatMap((d) => [d.leader, d.consensus])) + 2);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="leaderFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b7cf6" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#8b7cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#20262f" vertical={false} />
        <XAxis dataKey="t" stroke="#49515c" tick={{ fill: '#6b7480', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis
          domain={[lo, hi]}
          stroke="#49515c"
          tick={{ fill: '#6b7480', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
          unit="%"
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(27,33,43,0.92)',
            border: '1px solid #3a4452',
            borderRadius: 10,
            fontSize: 12,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          }}
          labelStyle={{ color: '#a8b0bd' }}
          itemStyle={{ padding: 0 }}
          formatter={(v: number, name: string) => [`${v}%`, name === 'leader' ? 'Leader' : 'Consensus']}
        />
        <Area
          type="monotone"
          dataKey="leader"
          stroke="#8b7cf6"
          strokeWidth={2}
          fill="url(#leaderFill)"
          dot={false}
          isAnimationActive={false}
          name="leader"
        />
        <Line
          type="monotone"
          dataKey="consensus"
          stroke="#2dd4bf"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
          isAnimationActive={false}
          name="consensus"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
