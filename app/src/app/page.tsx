"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "../components/Header";
import { useProgram } from "../hooks/useProgram";
import { isVerified } from "../lib/verified";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

type SortMode = "top" | "new";

interface Artist {
  mint: string;
  name: string;
  symbol: string;
  price: number;
  realSolReserves: number;
  totalSupply: number;
  isActive: boolean;
  uri: string;
  createdAt: number; // unix timestamp
}

function formatSupply(rawSupply: number): string {
  const tokens = rawSupply / 1_000_000; // 6 decimals → whole tokens
  if (tokens >= 1_000_000_000) return (tokens / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (tokens >= 1_000_000) return (tokens / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (tokens >= 1_000) return (tokens / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return tokens.toFixed(0);
}

const RANK_STYLES: Record<number, { border: string; badge: string; label: string }> = {
  1: { border: "border-yellow-500/60 hover:border-yellow-400", badge: "bg-yellow-500 text-black", label: "🥇" },
  2: { border: "border-gray-400/50 hover:border-gray-300",    badge: "bg-gray-400 text-black",   label: "🥈" },
  3: { border: "border-amber-600/50 hover:border-amber-500",  badge: "bg-amber-600 text-white",  label: "🥉" },
};

function ArtistCard({ artist, rank }: { artist: Artist; rank: number }) {
  const imageUrl = artist.uri?.startsWith("http") ? artist.uri : null;
  const rankStyle = RANK_STYLES[rank];
  const isHot = artist.realSolReserves > 0.005; // has real buy activity

  return (
    <Link
      href={`/artist/${artist.mint}`}
      className={`block bg-gray-900 border rounded-xl p-6 transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/10 relative ${
        rankStyle ? rankStyle.border : "border-gray-800 hover:border-purple-500"
      }`}
    >
      {/* Rank badge */}
      <div className="absolute -top-3 -left-3">
        {rankStyle ? (
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black shadow-lg ${rankStyle.badge}`}>
            {rank}
          </span>
        ) : (
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold bg-gray-800 text-gray-500 border border-gray-700">
            {rank}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl font-bold overflow-hidden flex-shrink-0">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={artist.name} className="w-full h-full object-cover" />
          ) : (
            artist.name[0]
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-lg font-bold text-white truncate">{artist.name}</h3>
            {isVerified(artist.mint) ? (
              <span className="text-xs text-green-400 border border-green-700/50 bg-green-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">✓</span>
            ) : (
              <span className="text-xs text-yellow-600 border border-yellow-800/50 bg-yellow-900/20 px-1.5 py-0.5 rounded-full flex-shrink-0">⚠</span>
            )}
            {isHot && (
              <span className="text-xs text-orange-400 flex-shrink-0">🔥</span>
            )}
          </div>
          <p className="text-sm text-gray-400">${artist.symbol}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-gray-500 uppercase">Price</p>
          <p className="text-sm font-mono text-white">
            {artist.price > 0 ? artist.price.toFixed(8) : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Liquidity</p>
          <p className="text-sm font-mono text-white">
            {artist.realSolReserves.toFixed(4)} SOL
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase">Supply</p>
          <p className="text-sm font-mono text-white">
            {formatSupply(artist.totalSupply)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 rounded-full bg-gray-800" />
        <div className="flex-1">
          <div className="h-4 bg-gray-800 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-800 rounded w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 bg-gray-800 rounded" />
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const program = useProgram();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("top");
  const [searchQuery, setSearchQuery] = useState("");

  // Global activity feed
  interface GlobalActivity {
    type: "buy" | "sell";
    wallet: string;
    tokenAmount: number;
    solAmount: number;
    timestamp: number;
    sig: string;
    mint: string;
    symbol?: string;
  }
  const [globalActivity, setGlobalActivity] = useState<GlobalActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    async function fetchArtists() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accounts = await (program.account as any).bondingCurve.all();
        const parsed: Artist[] = accounts.map((a: { publicKey: PublicKey; account: any }) => {
          const c = a.account;
          const vSol = (c.virtualSolReserves as BN).toNumber();
          const vTokens = (c.virtualTokenReserves as BN).toNumber();
          const price = vTokens > 0 ? vSol / vTokens : 0;
          return {
            mint: (c.mint as PublicKey).toString(),
            name: c.name as string,
            symbol: c.symbol as string,
            price,
            realSolReserves: (c.realSolReserves as BN).toNumber() / LAMPORTS_PER_SOL,
            totalSupply: (c.totalSupply as BN).toNumber(),
            isActive: c.isActive as boolean,
            uri: c.uri as string,
            createdAt: (c.createdAt as BN).toNumber(),
          };
        });
        // Default: sort by liquidity (proxy for trading activity)
        parsed.sort((a, b) => b.realSolReserves - a.realSolReserves);
        setArtists(parsed);
      } catch (err) {
        console.error("Failed to fetch artists:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchArtists();
  }, [program]);

  // Fetch global activity feed
  useEffect(() => {
    async function fetchGlobalActivity() {
      try {
        const res = await fetch("/api/activity/global");
        const data = await res.json();
        if (data.activities) setGlobalActivity(data.activities);
      } catch { /* ignore */ } finally {
        setActivityLoading(false);
      }
    }
    fetchGlobalActivity();
  }, []);

  // Apply sort — derive sorted list, keep original for rank in "top" mode
  const filteredArtists = searchQuery.trim()
    ? artists.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.symbol.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : artists;

  const sortedArtists = [...filteredArtists].sort((a, b) =>
    sortMode === "new" ? b.createdAt - a.createdAt : b.realSolReserves - a.realSolReserves
  );

  // Rank is always based on "top" sort (liquidity), regardless of display sort
  const topRankMap = new Map(
    [...artists].sort((a, b) => b.realSolReserves - a.realSolReserves).map((a, i) => [a.mint, i + 1])
  );

  const totalLiquidity = artists.reduce((s, a) => s + a.realSolReserves, 0);

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />

      {/* Hero */}
      <section className="px-6 py-16 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            The Stock Market for{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Music Artists
            </span>
          </h2>
          <p className="text-lg text-gray-400 mb-8">
            Invest in the artists you believe in. Buy their token early. As they
            grow, so does your investment. Powered by Solana.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/launch"
              className="bg-purple-600 hover:bg-purple-500 text-white font-medium px-6 py-3 rounded-lg transition"
            >
              I&apos;m an Artist →
            </Link>
            <a
              href="#discover"
              className="border border-gray-700 hover:border-purple-500 text-white font-medium px-6 py-3 rounded-lg transition"
            >
              Discover Artists
            </a>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-gray-800 px-6 py-6">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{loading ? "—" : artists.length}</p>
            <p className="text-xs text-gray-500 uppercase">Artists</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">
              {loading ? "—" : `${totalLiquidity.toFixed(3)} SOL`}
            </p>
            <p className="text-xs text-gray-500 uppercase">Total Liquidity</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">Mainnet</p>
            <p className="text-xs text-gray-500 uppercase">Network</p>
          </div>
        </div>
      </section>

      {/* Leaderboard */}
      <section id="discover" className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Search bar */}
          <div className="relative mb-5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search artists..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-700 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition text-lg leading-none"
              >×</button>
            )}
          </div>

          {/* Header row */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">🏆 Leaderboard</h2>
              {!loading && artists.length > 0 && (
                <span className="text-xs text-gray-500 bg-gray-900 border border-gray-800 px-2 py-1 rounded-full">
                  {searchQuery ? `${sortedArtists.length} of ${artists.length}` : `${artists.length} artist${artists.length !== 1 ? "s" : ""}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Sort tabs */}
              <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5">
                {(["top", "new"] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSortMode(mode)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                      sortMode === mode
                        ? "bg-purple-600 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {mode === "top" ? "🔥 Top" : "✨ New"}
                  </button>
                ))}
              </div>
              <Link
                href="/launch"
                className="text-xs text-purple-400 hover:text-purple-300 transition border border-purple-900 hover:border-purple-700 px-3 py-1.5 rounded-lg"
              >
                + Launch
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : sortedArtists.length === 0 && searchQuery ? (
            <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-xl">
              <p className="text-4xl mb-4">🔍</p>
              <p className="text-gray-400 mb-2">No artists found for "{searchQuery}"</p>
              <button onClick={() => setSearchQuery("")} className="text-purple-400 hover:text-purple-300 text-sm transition">
                Clear search
              </button>
            </div>
          ) : artists.length === 0 ? (
            <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-xl">
              <p className="text-4xl mb-4">🎤</p>
              <p className="text-gray-400 mb-2">No artists yet.</p>
              <Link href="/launch" className="text-purple-400 hover:text-purple-300 text-sm transition">
                Be the first to launch →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
              {sortedArtists.map((a) => (
                <ArtistCard key={a.mint} artist={a} rank={topRankMap.get(a.mint) ?? 99} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Global Activity Feed */}
      <section className="px-6 py-12 border-t border-gray-800">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xl font-bold">⚡ Live Activity</h2>
            <span className="text-xs text-gray-600">recent trades across all artists</span>
          </div>

          {activityLoading ? (
            <p className="text-gray-600 text-sm">Loading activity...</p>
          ) : globalActivity.length === 0 ? (
            <p className="text-gray-600 text-sm">No activity yet — be the first to trade.</p>
          ) : (
            <div className="space-y-2">
              {globalActivity.map((item) => {
                const artist = artists.find(a => a.mint === item.mint);
                const symbol = artist?.symbol ?? item.mint.slice(0, 6);
                return (
                  <div
                    key={item.sig}
                    className="flex items-center justify-between bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 hover:border-gray-700 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.type === "buy" ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                        {item.type === "buy" ? "BUY" : "SELL"}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{item.wallet}</span>
                      <span className="text-xs text-white">
                        {item.type === "buy" ? "bought" : "sold"}{" "}
                        <span className="font-mono font-medium">
                          {item.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${symbol}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="font-mono">{item.solAmount.toFixed(4)} SOL</span>
                      <a
                        href={`https://explorer.solana.com/tx/${item.sig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition"
                      >
                        ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="px-6 py-16 border-t border-gray-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="text-4xl mb-4">🎤</div>
              <h3 className="text-lg font-bold mb-2">Artists Launch</h3>
              <p className="text-sm text-gray-400">
                Create a personal token on Solana in minutes. Set your name, upload your image, link your music.
              </p>
            </div>
            <div>
              <div className="text-4xl mb-4">📈</div>
              <h3 className="text-lg font-bold mb-2">Fans Invest</h3>
              <p className="text-sm text-gray-400">
                Buy artist tokens via a bonding curve. The earlier you invest, the lower the price.
              </p>
            </div>
            <div>
              <div className="text-4xl mb-4">💎</div>
              <h3 className="text-lg font-bold mb-2">Everyone Wins</h3>
              <p className="text-sm text-gray-400">
                Artists get direct funding. Early fans are rewarded. No labels, no middlemen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 px-6 py-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <p>© 2026 FanStake. Built on Solana.</p>
          <div className="flex gap-4">
            <a href="https://x.com/FanStakeMusic" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Twitter</a>
            <a href="https://discord.gg/JPJVNdT3Ga" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Discord</a>
            <a href="https://t.me/fanstakemusic" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Telegram</a>
            <a href="#" className="hover:text-white transition">Docs</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
