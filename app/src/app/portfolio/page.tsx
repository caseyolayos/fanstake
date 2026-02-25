"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { Header } from "../../components/Header";
import { WalletButton } from "../../components/WalletButton";
import { useWallet, useConnection } from "../../components/WalletProvider";
import { useProgram, getBondingCurvePDA } from "../../hooks/useProgram";

interface HoldingRow {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  tokenBalance: number;   // UI amount (adjusted for decimals)
  price: number;          // SOL per raw token unit
  valueSOL: number;       // estimated SOL value
  pct: number;            // % of token supply sold
}

function calcPrice(virtualSolReserves: BN, virtualTokenReserves: BN): number {
  const vSol = virtualSolReserves.toNumber();
  const vTokens = virtualTokenReserves.toNumber();
  return vTokens > 0 ? vSol / vTokens : 0;
}

export default function PortfolioPage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const program = useProgram();

  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Get SOL balance
      const sol = await connection.getBalance(publicKey);
      setSolBalance(sol / LAMPORTS_PER_SOL);

      // 2. Get all token accounts owned by this wallet (source of truth)
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );

      // Filter to only accounts with balance > 0
      const heldMints = tokenAccounts.value
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((a: any) => {
          const amount = a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0;
          return amount > 0;
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((a: any) => ({
          mint: a.account.data.parsed.info.mint as string,
          uiAmount: a.account.data.parsed.info.tokenAmount.uiAmount as number,
          rawAmount: a.account.data.parsed.info.tokenAmount.amount as string,
        }));

      if (heldMints.length === 0) {
        setHoldings([]);
        return;
      }

      // 3. Fetch all FanStake bonding curves and build a mint → curve map
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allCurves = await (program.account as any).bondingCurve.all();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const curveByMint = new Map<string, any>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allCurves.forEach((c: { publicKey: PublicKey; account: any }) => {
        const mintKey = (c.account.mint as PublicKey).toString();
        curveByMint.set(mintKey, c.account);
      });

      // 4. Match held tokens against FanStake curves
      const rows: HoldingRow[] = [];
      for (const held of heldMints) {
        const curve = curveByMint.get(held.mint);
        if (!curve) continue; // not a FanStake token

        const price = calcPrice(
          curve.virtualSolReserves as BN,
          curve.virtualTokenReserves as BN
        );
        const valueSOL = (parseInt(held.rawAmount) * price) / LAMPORTS_PER_SOL;
        const totalSupply = (curve.totalSupply as BN).toNumber();
        const realTokenReserves = (curve.realTokenReserves as BN).toNumber();
        const pct = totalSupply > 0
          ? ((totalSupply - realTokenReserves) / totalSupply) * 100
          : 0;

        rows.push({
          mint: held.mint,
          name: curve.name as string,
          symbol: curve.symbol as string,
          uri: curve.uri as string,
          tokenBalance: held.uiAmount,
          price,
          valueSOL,
          pct,
        });
      }

      // Sort by value desc
      rows.sort((a, b) => b.valueSOL - a.valueSOL);
      setHoldings(rows);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Failed to load portfolio: " + msg);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection, program]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const totalValueSOL = holdings.reduce((s, h) => s + h.valueSOL, 0);

  // ---------------------------------------------------------------------------
  // Not connected
  // ---------------------------------------------------------------------------
  if (!publicKey) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <p className="text-6xl mb-6">👛</p>
          <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-8">
            Connect your Solana wallet to see your FanStake holdings.
          </p>
          <WalletButton />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Main view
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Portfolio</h1>
          <button
            onClick={fetchPortfolio}
            className="text-xs text-gray-500 hover:text-white transition border border-gray-800 hover:border-gray-600 rounded-lg px-3 py-2"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 uppercase mb-1">SOL Balance</p>
            <p className="text-xl font-bold font-mono">
              {solBalance !== null ? solBalance.toFixed(4) : "—"}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 uppercase mb-1">Tokens Held</p>
            <p className="text-xl font-bold">{holdings.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 uppercase mb-1">Portfolio Value</p>
            <p className="text-xl font-bold font-mono">
              ~{totalValueSOL.toFixed(4)} SOL
            </p>
          </div>
        </div>

        {/* Wallet address */}
        <p className="text-xs text-gray-600 font-mono mb-6">
          {publicKey.toString()}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-xl text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Holdings table */}
        {holdings.length === 0 ? (
          <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-xl">
            <p className="text-4xl mb-4">🎧</p>
            <p className="text-gray-400 mb-2">No artist tokens yet.</p>
            <Link
              href="/"
              className="text-purple-400 hover:text-purple-300 text-sm transition"
            >
              Discover artists to invest in →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {holdings.map((h) => {
              const imageUrl = h.uri?.startsWith("http") ? h.uri : null;
              return (
                <Link
                  key={h.mint}
                  href={`/artist/${h.mint}`}
                  className="flex items-center gap-4 bg-gray-900 border border-gray-800 hover:border-purple-500 rounded-xl p-4 transition-all group"
                >
                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg font-bold flex-shrink-0 overflow-hidden">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={h.name} className="w-full h-full object-cover" />
                    ) : (
                      h.name[0]
                    )}
                  </div>

                  {/* Name + symbol */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white group-hover:text-purple-300 transition">
                      {h.name}
                    </p>
                    <p className="text-sm text-gray-400">${h.symbol}</p>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden w-32">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${Math.min(h.pct, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{h.pct.toFixed(1)}% sold</p>
                  </div>

                  {/* Balance */}
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono font-bold text-white">
                      {h.tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-500">{h.symbol}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ≈{h.valueSOL.toFixed(4)} SOL
                    </p>
                  </div>

                  <span className="text-gray-600 group-hover:text-purple-400 transition text-lg">›</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
