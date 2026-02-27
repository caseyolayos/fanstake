"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import Link from "next/link";
import { Header } from "../../../components/Header";
import { WalletButton } from "../../../components/WalletButton";
import { useWallet } from "../../../components/WalletProvider";
import { useProgram, getBondingCurvePDA } from "../../../hooks/useProgram";

interface CurveData {
  artist: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  virtualSolReserves: BN;
  virtualTokenReserves: BN;
  realSolReserves: BN;
  realTokenReserves: BN;
  totalSupply: BN;
  artistShareBps: number;
  isActive: boolean;
}

interface HolderItem {
  wallet: string;
  amount: number;
  pct: number;
}

interface ActivityItem {
  type: "buy" | "sell";
  wallet: string;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  sig: string;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 uppercase mb-1">{label}</p>
      <p className="text-xl font-bold font-mono text-white">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const params = useParams();
  const mintStr = params.mint as string;
  const { publicKey } = useWallet();
  const program = useProgram();

  const [curve, setCurve] = useState<CurveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holders, setHolders] = useState<HolderItem[]>([]);
  const [holderTotal, setHolderTotal] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [artistImage, setArtistImage] = useState<string | null>(null);

  const fetchCurve = useCallback(async () => {
    try {
      const mintPubkey = new PublicKey(mintStr);
      const [pda] = getBondingCurvePDA(mintPubkey);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc = await (program.account as any).bondingCurve.fetch(pda);
      setCurve(acc as CurveData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [mintStr, program]);

  useEffect(() => { fetchCurve(); }, [fetchCurve]);

  // Resolve artist image — URI may be a JSON metadata file or a direct image URL
  useEffect(() => {
    if (!curve?.uri?.startsWith("https://")) return;
    fetch(`/api/fetch-metadata?url=${encodeURIComponent(curve.uri)}`)
      .then(r => r.json())
      .then(data => {
        if (data.image) setArtistImage(data.image);
        else if (!data.error) setArtistImage(curve.uri); // direct image URI
      })
      .catch(() => setArtistImage(curve.uri)); // fallback to URI directly
  }, [curve?.uri]);

  useEffect(() => {
    fetch(`/api/holders/${mintStr}`)
      .then((r) => r.json())
      .then((d) => { if (d.holders) { setHolders(d.holders); setHolderTotal(d.total); } })
      .catch(() => {});
  }, [mintStr]);

  useEffect(() => {
    fetch(`/api/activity/${mintStr}`)
      .then((r) => r.json())
      .then((d) => { if (d.activities) setActivity(d.activities); })
      .catch(() => {});
  }, [mintStr]);

  const embedCode = `<iframe src="https://fanstake.app/embed/${mintStr}" width="380" height="220" frameborder="0" style="border-radius:16px;"></iframe>`;

  const copyEmbed = () => {
    navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !curve) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <p className="text-red-400 mb-4">{error ?? "Token not found"}</p>
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm">← Back</Link>
        </div>
      </div>
    );
  }

  // Access check — only the artist can view this
  const isArtist = publicKey && curve.artist.toString() === publicKey.toString();

  if (!publicKey) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-xl mx-auto px-6 py-20 text-center">
          <p className="text-5xl mb-6">🔒</p>
          <h2 className="text-xl font-bold mb-2">Artist Dashboard</h2>
          <p className="text-gray-400 mb-6 text-sm">Connect the wallet that launched ${curve.symbol} to access your dashboard.</p>
          <WalletButton />
        </div>
      </div>
    );
  }

  if (!isArtist) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-xl mx-auto px-6 py-20 text-center">
          <p className="text-5xl mb-6">🚫</p>
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-6 text-sm">This dashboard is only accessible to the wallet that launched ${curve.symbol}.</p>
          <Link href={`/artist/${mintStr}`} className="text-purple-400 hover:text-purple-300 text-sm">View token page →</Link>
        </div>
      </div>
    );
  }

  // Stats
  const vSol = curve.virtualSolReserves.toNumber();
  const vTokens = curve.virtualTokenReserves.toNumber();
  const realSol = curve.realSolReserves.toNumber();
  const totalSupply = curve.totalSupply.toNumber();
  const realTokenReserves = curve.realTokenReserves.toNumber();
  const price = vTokens > 0 ? (vSol / vTokens) * 1e6 : 0; // lamports per 1 token
  const pctSold = ((totalSupply - realTokenReserves) / totalSupply) * 100;
  const marketCap = (price / LAMPORTS_PER_SOL) * (totalSupply / 1_000_000);
  const recentVolume = activity.reduce((s, a) => s + a.solAmount, 0);

  const imageUrl = artistImage;

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Page header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold overflow-hidden flex-shrink-0">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={curve.name} className="w-full h-full object-cover" />
            ) : curve.name[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{curve.name} Dashboard</h1>
            <p className="text-gray-400 text-sm">${curve.symbol} · <Link href={`/artist/${mintStr}`} className="text-purple-400 hover:text-purple-300">View token page ↗</Link></p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatCard label="Token Price" value={`${(price / LAMPORTS_PER_SOL).toFixed(6)} SOL`} />
          <StatCard label="Fans Holding" value={holders.length.toString()} sub={`${pctSold.toFixed(1)}% of supply sold`} />
          <StatCard label="Liquidity (Real)" value={`${(realSol / LAMPORTS_PER_SOL).toFixed(4)} SOL`} />
          <StatCard label="Market Cap (FDV)" value={`${marketCap.toFixed(4)} SOL`} sub={`≈ ${recentVolume.toFixed(4)} SOL recent vol`} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

          {/* Top Holders */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-300 mb-4">🏆 Top Holders</h3>
            {holders.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">No holders yet</p>
            ) : (
              <div className="space-y-2">
                {holders.slice(0, 10).map((h, i) => (
                  <div key={h.wallet} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600 w-4">{i + 1}</span>
                      <a
                        href={`https://explorer.solana.com/address/${h.wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-purple-400 hover:text-purple-300 transition"
                      >
                        {h.wallet.slice(0, 4)}...{h.wallet.slice(-4)}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${h.pct}%` }} />
                      </div>
                      <span className="text-gray-400 w-16 text-right">
                        {h.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-gray-600 w-10 text-right">{h.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
                {holderTotal > 0 && (
                  <p className="text-xs text-gray-600 pt-2 border-t border-gray-800">
                    Total in top holders: {holderTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${curve.symbol}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-gray-300 mb-4">📈 Recent Trades</h3>
            {activity.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">No trades yet</p>
            ) : (
              <div className="space-y-2">
                {activity.map((item) => (
                  <div key={item.sig} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.type === "buy" ? "bg-green-500" : "bg-red-500"}`} />
                      <a
                        href={`https://explorer.solana.com/tx/${item.sig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-gray-400 hover:text-white transition"
                      >
                        {item.wallet}
                      </a>
                      <span className={item.type === "buy" ? "text-green-400" : "text-red-400"}>
                        {item.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-500">
                      <span>{item.solAmount.toFixed(4)} SOL</span>
                      <span>{timeAgo(item.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Embed widget section */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h3 className="text-sm font-bold text-gray-300 mb-1">🔗 Embed on your website</h3>
          <p className="text-xs text-gray-500 mb-4">Drop this on your Linktree, personal site, or anywhere fans visit.</p>
          <div className="flex gap-2">
            <code className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-gray-300 overflow-x-auto whitespace-nowrap">
              {embedCode}
            </code>
            <button
              onClick={copyEmbed}
              className="flex-shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-lg transition"
            >
              {embedCopied ? "✅ Copied!" : "Copy"}
            </button>
          </div>
          <div className="mt-4 border border-gray-800 rounded-xl overflow-hidden" style={{ height: 220 }}>
            <iframe
              src={`/embed/${mintStr}`}
              width="100%"
              height="220"
              frameBorder="0"
              className="w-full"
            />
          </div>
        </div>

        {/* Share */}
        <div className="text-center">
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(`Check out my $${curve.symbol} token on @FanStakeMusic 🎵\n\nFans can invest early — bonding curve on Solana.\n\nhttps://fanstake.app/artist/${mintStr}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-black border border-gray-700 hover:border-white text-white text-sm font-medium px-5 py-2.5 rounded-xl transition"
          >
            𝕏 Share your token on X
          </a>
        </div>

      </div>
    </div>
  );
}
