"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Header } from "../../components/Header";
import { WalletButton } from "../../components/WalletButton";
import { useWallet, useConnection } from "../../components/WalletProvider";
import { useProgram, getBondingCurvePDA } from "../../hooks/useProgram";
import type { PositionData } from "../api/portfolio/[wallet]/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HoldingRow {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  tokenBalance: number;
  price: number;        // lamports per raw token unit
  valueSOL: number;
  pct: number;          // % of supply sold
  // enriched after position data loads
  costBasisSOL?: number;
  pnlSOL?: number;
  pnlPct?: number;
  priceMultiple?: number;
  isArtist?: boolean;       // wallet is the token's artist (has free allocation)
  artistAllocationSOL?: number; // current value of free 100M artist tokens
  boughtTokenBalance?: number;  // tokens actually purchased (excluding artist share)
  boughtValueSOL?: number;      // value of purchased tokens only
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcPrice(virtualSolReserves: BN, virtualTokenReserves: BN): number {
  const vSol = virtualSolReserves.toNumber();
  const vTokens = virtualTokenReserves.toNumber();
  return vTokens > 0 ? vSol / vTokens : 0;
}

/** Format SOL price per human token (price is lamports per raw unit, 6 decimals) */
function formatTokenPrice(priceLamports: number): string {
  const sol = (priceLamports * 1_000_000) / LAMPORTS_PER_SOL;
  if (sol === 0) return "0";
  if (sol >= 0.001) return sol.toFixed(4);
  if (sol >= 0.000001) return sol.toFixed(7);
  // Very tiny: use enough decimal places to show 3 sig figs, never scientific notation
  const decimals = Math.min(Math.ceil(-Math.log10(sol)) + 2, 12);
  return sol.toFixed(decimals);
}

function formatPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const sign = pnl >= 0 ? "+" : "-";
  return `${sign}${abs.toFixed(4)} SOL`;
}

interface TasteResult {
  score: number;    // avg price multiple
  grade: string;
  emoji: string;
  label: string;
}

function calcTasteScore(holdings: HoldingRow[]): TasteResult | null {
  const withData = holdings.filter(h => h.priceMultiple !== undefined);
  if (withData.length === 0) return null;

  // Weighted average by current SOL value
  const totalValue = withData.reduce((s, h) => s + h.valueSOL, 0);
  const score =
    totalValue > 0
      ? withData.reduce((s, h) => s + h.priceMultiple! * h.valueSOL, 0) / totalValue
      : withData.reduce((s, h) => s + h.priceMultiple!, 0) / withData.length;

  let grade: string, emoji: string, label: string;
  if (score >= 5)        { grade = "S";  emoji = "🔮"; label = "Visionary"; }
  else if (score >= 3)   { grade = "A";  emoji = "👑"; label = "Elite Taste"; }
  else if (score >= 2)   { grade = "B";  emoji = "🔥"; label = "Early Eye"; }
  else if (score >= 1.5) { grade = "C";  emoji = "✨"; label = "Ahead of the Curve"; }
  else if (score >= 1)   { grade = "D";  emoji = "🌱"; label = "Just Getting Started"; }
  else                   { grade = "F";  emoji = "💎"; label = "HODL Mode"; }

  return { score, grade, emoji, label };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useProgram();

  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageMap, setImageMap] = useState<Record<string, string>>({});

  // ── Fetch on-chain curve data ──────────────────────────────────────────────
  const fetchCurves = useCallback(async () => {
    if (!publicKey || !program) return;
    setLoading(true);
    setError(null);

    try {
      const sol = await connection.getBalance(publicKey);
      setSolBalance(sol / LAMPORTS_PER_SOL);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heldMints = tokenAccounts.value
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((a: any) => (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0) > 0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((a: any) => ({
          mint: a.account.data.parsed.info.mint as string,
          uiAmount: a.account.data.parsed.info.tokenAmount.uiAmount as number,
          rawAmount: a.account.data.parsed.info.tokenAmount.amount as string,
        }));

      if (heldMints.length === 0) { setHoldings([]); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allCurves = await (program.account as any).bondingCurve.all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curveByMint = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allCurves.forEach((c: { publicKey: PublicKey; account: any }) => {
        curveByMint.set((c.account.mint as PublicKey).toString(), c.account);
      });

      const rows: HoldingRow[] = [];
      for (const held of heldMints) {
        const curve = curveByMint.get(held.mint);
        if (!curve) continue;

        const price = calcPrice(curve.virtualSolReserves as BN, curve.virtualTokenReserves as BN);
        const rawBalance = parseInt(held.rawAmount);
        const valueSOL = (rawBalance * price) / LAMPORTS_PER_SOL;
        const totalSupply = (curve.totalSupply as BN).toNumber();
        const realTokenReserves = (curve.realTokenReserves as BN).toNumber();
        const pct = totalSupply > 0 ? ((totalSupply - realTokenReserves) / totalSupply) * 100 : 0;

        // Detect if this wallet is the artist — free 100M allocation skews P&L
        const isArtist = (curve.artist as PublicKey).toString() === publicKey.toString();
        const ARTIST_ALLOC_RAW = 100_000_000 * 1_000_000; // 100M tokens × 6 decimals
        const artistAllocRaw = isArtist ? Math.min(rawBalance, ARTIST_ALLOC_RAW) : 0;
        const boughtRaw = rawBalance - artistAllocRaw;
        const artistAllocationSOL = (artistAllocRaw * price) / LAMPORTS_PER_SOL;
        const boughtValueSOL = (boughtRaw * price) / LAMPORTS_PER_SOL;

        rows.push({
          mint: held.mint,
          name: curve.name as string,
          symbol: curve.symbol as string,
          uri: curve.uri as string,
          tokenBalance: held.uiAmount,
          price,
          valueSOL,
          pct,
          isArtist,
          artistAllocationSOL: isArtist ? artistAllocationSOL : undefined,
          boughtTokenBalance: isArtist ? boughtRaw / 1_000_000 : undefined,
          boughtValueSOL: isArtist ? boughtValueSOL : undefined,
        });
      }

      rows.sort((a, b) => b.valueSOL - a.valueSOL);
      setHoldings(rows);
    } catch (err) {
      setError("Failed to load portfolio: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection, program]);

  // ── Enrich with P&L from transaction history ──────────────────────────────
  const fetchPositions = useCallback(async () => {
    if (!publicKey) return;
    setPositionsLoading(true);
    try {
      const res = await fetch(`/api/portfolio/${publicKey.toString()}`);
      if (!res.ok) return;
      const positions: Record<string, PositionData> = await res.json();

      setHoldings(prev =>
        prev.map(h => {
          const pos = positions[h.mint];
          if (!pos || pos.avgEntryPriceLamports === 0) return h;

          const costBasisSOL = pos.totalSolSpentLamports / LAMPORTS_PER_SOL;
          // For artist wallets: P&L only on tokens they actually bought, not free allocation
          const valueForPnl = h.isArtist ? (h.boughtValueSOL ?? 0) : h.valueSOL;
          const pnlSOL = valueForPnl - costBasisSOL;
          const pnlPct = costBasisSOL > 0 ? (pnlSOL / costBasisSOL) * 100 : 0;
          const priceMultiple = pos.avgEntryPriceLamports > 0
            ? h.price / pos.avgEntryPriceLamports
            : undefined;

          return { ...h, costBasisSOL, pnlSOL, pnlPct, priceMultiple };
        })
      );
    } catch {
      // silently ignore — P&L just won't show
    } finally {
      setPositionsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => { fetchCurves(); }, [fetchCurves]);

  // Resolve images — fetch metadata JSON for tokens that have a JSON URI
  useEffect(() => {
    if (holdings.length === 0) return;
    holdings.forEach((h) => {
      if (!h.uri?.startsWith("https://")) return;
      fetch(`/api/fetch-metadata?url=${encodeURIComponent(h.uri)}`)
        .then(r => r.json())
        .then(data => {
          const img = data.image ?? h.uri;
          setImageMap(prev => ({ ...prev, [h.mint]: img }));
        })
        .catch(() => setImageMap(prev => ({ ...prev, [h.mint]: h.uri })));
    });
  }, [holdings]);

  // Enrich with P&L after holdings load
  useEffect(() => {
    if (holdings.length > 0 && !loading) fetchPositions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleRefresh = useCallback(() => {
    fetchCurves();
  }, [fetchCurves]);

  const totalValueSOL = holdings.reduce((s, h) => s + h.valueSOL, 0);
  // For P&L totals: use bought-only value for artist holdings to avoid inflated numbers
  const totalPnlSOL = holdings.reduce((s, h) => {
    if (!h.isArtist) return s + (h.pnlSOL ?? 0);
    if ((h.boughtTokenBalance ?? 0) > 0 && h.pnlSOL !== undefined) return s + h.pnlSOL;
    return s;
  }, 0);
  const hasPnlData = holdings.some(h =>
    h.pnlSOL !== undefined && (!h.isArtist || (h.boughtTokenBalance ?? 0) > 0)
  );
  const taste = calcTasteScore(holdings);

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <p className="text-6xl mb-6">👛</p>
          <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-8">Connect your Solana wallet to see your FanStake holdings.</p>
          <WalletButton />
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading your portfolio...</p>
        </div>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Portfolio</h1>
            <p className="text-xs text-gray-600 font-mono mt-1">{publicKey.toString()}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="text-xs text-gray-500 hover:text-white transition border border-gray-800 hover:border-gray-600 rounded-lg px-3 py-2"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 uppercase mb-1">SOL Balance</p>
            <p className="text-xl font-bold font-mono">
              {solBalance !== null ? solBalance.toFixed(4) : "—"}
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 uppercase mb-1">Holdings Value</p>
            <p className="text-xl font-bold font-mono">
              {totalValueSOL.toFixed(4)} SOL
            </p>
          </div>

          <div className={`border rounded-xl p-4 text-center ${
            !hasPnlData
              ? "bg-gray-900 border-gray-800"
              : totalPnlSOL >= 0
                ? "bg-green-900/20 border-green-800/50"
                : "bg-red-900/20 border-red-800/50"
          }`}>
            <p className="text-xs text-gray-500 uppercase mb-1">Unrealized P&amp;L</p>
            {positionsLoading ? (
              <div className="inline-block w-4 h-4 border border-gray-600 border-t-transparent rounded-full animate-spin" />
            ) : hasPnlData ? (
              <p className={`text-xl font-bold font-mono ${totalPnlSOL >= 0 ? "text-green-400" : "text-red-400"}`}>
                {formatPnl(totalPnlSOL)}
              </p>
            ) : (
              <p className="text-xl font-bold text-gray-600">—</p>
            )}
          </div>

          <div className={`border rounded-xl p-4 text-center ${taste ? "bg-purple-900/20 border-purple-800/50" : "bg-gray-900 border-gray-800"}`}>
            <p className="text-xs text-gray-500 uppercase mb-1">Taste Score</p>
            {positionsLoading ? (
              <div className="inline-block w-4 h-4 border border-gray-600 border-t-transparent rounded-full animate-spin" />
            ) : taste ? (
              <div>
                <p className="text-2xl font-black text-purple-300">
                  {taste.emoji} {taste.grade}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{taste.label}</p>
              </div>
            ) : (
              <p className="text-xl font-bold text-gray-600">—</p>
            )}
          </div>
        </div>

        {taste && (
          <p className="text-xs text-gray-600 text-right mb-6">
            Taste score = avg {taste.score.toFixed(2)}× return across all positions
          </p>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-sm text-red-300">{error}</div>
        )}

        {/* Holdings */}
        {holdings.length === 0 ? (
          <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-xl">
            <p className="text-4xl mb-4">🎧</p>
            <p className="text-gray-400 mb-2">No artist tokens yet.</p>
            <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm transition">
              Discover artists to invest in →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {holdings.map((h) => {
              const imageUrl = imageMap[h.mint] ?? (h.uri?.startsWith("http") ? h.uri : null);
              // For artist holdings: only show P&L if they actually bought tokens too
              const hasPnl = h.pnlSOL !== undefined && (!h.isArtist || (h.boughtTokenBalance ?? 0) > 0);
              const isUp = (h.pnlSOL ?? 0) >= 0;

              return (
                <Link
                  key={h.mint}
                  href={`/artist/${h.mint}`}
                  className="block bg-gray-900 border border-gray-800 hover:border-purple-500 rounded-xl p-4 transition-all group"
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg font-bold flex-shrink-0 overflow-hidden">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={h.name} className="w-full h-full object-cover" />
                      ) : h.name[0]}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">

                      {/* Top row: name + P&L badge */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-bold text-white group-hover:text-purple-300 transition truncate">
                          {h.name}
                          <span className="text-gray-500 font-normal ml-2 text-sm">${h.symbol}</span>
                        </p>
                        {hasPnl && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            isUp ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"
                          }`}>
                            {isUp ? "▲" : "▼"} {Math.abs(h.pnlPct!).toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Price row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
                        {hasPnl && h.costBasisSOL !== undefined && (
                          <span className="text-gray-500">
                            Entry: <span className="text-gray-300 font-mono">{formatTokenPrice(h.price / (h.priceMultiple ?? 1))} SOL</span>
                          </span>
                        )}
                        <span className="text-gray-500">
                          Now: <span className="text-gray-300 font-mono">{formatTokenPrice(h.price)} SOL</span>
                        </span>
                        {h.priceMultiple !== undefined && h.priceMultiple > 0 && (
                          <span className={`font-bold ${h.priceMultiple >= 2 ? "text-purple-400" : h.priceMultiple >= 1 ? "text-gray-400" : "text-red-400"}`}>
                            {h.priceMultiple.toFixed(2)}×
                          </span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden max-w-[120px]">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(h.pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-600">{h.pct.toFixed(1)}% sold</span>
                      </div>
                    </div>

                    {/* Right column: balance + value + P&L */}
                    <div className="text-right flex-shrink-0 min-w-[100px]">
                      {h.isArtist ? (
                        // Artist view: split allocation vs. bought
                        <>
                          <p className="text-xs text-purple-400 font-semibold mb-0.5">🎤 Artist</p>
                          <p className="text-xs text-gray-500">
                            <span className="text-gray-300 font-mono">100M</span> free share
                          </p>
                          <p className="text-xs text-gray-600">≈{(h.artistAllocationSOL ?? 0).toFixed(3)} SOL</p>
                          {(h.boughtTokenBalance ?? 0) > 0 && (
                            <>
                              <p className="text-xs text-gray-500 mt-1">
                                <span className="text-gray-300 font-mono">
                                  {(h.boughtTokenBalance!).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span> bought
                              </p>
                              <p className="text-xs text-gray-600">≈{(h.boughtValueSOL ?? 0).toFixed(4)} SOL</p>
                              {hasPnl && (
                                <p className={`text-xs font-mono font-bold mt-1 ${isUp ? "text-green-400" : "text-red-400"}`}>
                                  {formatPnl(h.pnlSOL!)}
                                </p>
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        // Regular fan view
                        <>
                          <p className="font-mono font-bold text-white text-sm">
                            {h.tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </p>
                          <p className="text-xs text-gray-500">{h.symbol}</p>
                          <p className="text-xs text-gray-400 mt-0.5">≈{h.valueSOL.toFixed(4)} SOL</p>
                          {hasPnl && (
                            <p className={`text-xs font-mono font-bold mt-1 ${isUp ? "text-green-400" : "text-red-400"}`}>
                              {formatPnl(h.pnlSOL!)}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
