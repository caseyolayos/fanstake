"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

interface Props {
  virtualSolReserves: number;   // lamports
  virtualTokenReserves: number; // raw (6 decimals)
  totalSupply: number;           // raw (6 decimals)
  symbol: string;
}

// Format a price-per-token value (already in SOL, not lamports) into a readable string.
// Avoids scientific notation — shows lamports for micro prices instead.
function fmtPrice(solPerToken: number): string {
  if (solPerToken >= 0.001)      return solPerToken.toFixed(4) + " SOL";
  if (solPerToken >= 0.000001)   return solPerToken.toFixed(8) + " SOL";
  // Below 1 microSOL — show in lamports (1 SOL = 1e9 lamports)
  const lamports = solPerToken * 1e9;
  if (lamports >= 1)             return lamports.toFixed(2) + " lamports";
  return (lamports * 1000).toFixed(2) + " milli-lamports";
}

// Custom tooltip
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
      <p className="text-gray-400 mb-1">{label}% sold</p>
      <p className="text-white font-mono">{fmtPrice(payload[0].value)} / token</p>
    </div>
  );
}

export function BondingCurveChart({
  virtualSolReserves,
  virtualTokenReserves,
  totalSupply,
  symbol,
}: Props) {
  // Constant product k = vSol * vTokens
  const k = virtualSolReserves * virtualTokenReserves;

  // Current % sold
  const initialVTokens = totalSupply; // at launch: all tokens in virtual reserve
  const initialVSol = k / initialVTokens;
  const tokensSoldNow = initialVTokens - virtualTokenReserves;
  const pctSoldNow = Math.max(0, Math.min(99, (tokensSoldNow / totalSupply) * 100));

  // Generate 100 data points from 0% → 95% sold
  const points: { pct: number; price: number }[] = [];
  for (let i = 0; i <= 95; i++) {
    const tokensSold = (i / 100) * totalSupply;
    const vTokens = initialVTokens - tokensSold;
    if (vTokens <= 0) break;
    const vSol = k / vTokens;
    const price = vSol / vTokens; // SOL lamports per raw token unit
    // Convert to lamports per 1 human token (1 human token = 1e6 raw)
    const pricePerToken = price * 1e6;
    points.push({ pct: i, price: pricePerToken });
  }

  // Current price point
  const currentPrice = (virtualSolReserves / virtualTokenReserves) * 1e6;
  const currentPct = Math.round(pctSoldNow);

  // Initial price for reference
  const initialPrice = (initialVSol / initialVTokens) * 1e6;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-gray-300">Bonding Curve</h3>
        <span className="text-xs text-gray-500">${symbol} price vs. tokens sold</span>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        Early buyers get the lowest price — every purchase moves the curve up.
      </p>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="pct"
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            ticks={[0, 20, 40, 60, 80, 95]}
          />
          <YAxis
            tickFormatter={(v) => fmtPrice(v)}
            tick={{ fill: "#6b7280", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Shade under the curve */}
          <Area
            type="monotone"
            dataKey="price"
            stroke="#a855f7"
            strokeWidth={2}
            fill="url(#curveGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#a855f7", strokeWidth: 0 }}
          />

          {/* Current price vertical line */}
          <ReferenceLine
            x={currentPct}
            stroke="#10b981"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{
              value: "NOW",
              position: "top",
              fill: "#10b981",
              fontSize: 9,
              fontWeight: "bold",
            }}
          />

          {/* Current price dot */}
          <ReferenceDot
            x={currentPct}
            y={currentPrice}
            r={5}
            fill="#10b981"
            stroke="#065f46"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend row */}
      <div className="flex items-center justify-between mt-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
            <span className="text-gray-500">Launch: {fmtPrice(initialPrice)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-400">Now: {fmtPrice(currentPrice)}</span>
          </div>
        </div>
        <span className="text-gray-600">{pctSoldNow.toFixed(2)}% sold</span>
      </div>
    </div>
  );
}
