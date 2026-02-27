"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { isVerified } from "../../../lib/verified";

interface CurveInfo {
  name: string;
  symbol: string;
  uri: string;
  virtualSolReserves: string;
  virtualTokenReserves: string;
  realTokenReserves: string;
  totalSupply: string;
}

function fmtPrice(lamports: number): string {
  const sol = (lamports / 1e9).toFixed(6);
  return `${sol} SOL`;
}

export default function EmbedPage() {
  const params = useParams();
  const mint = params.mint as string;
  const [curve, setCurve] = useState<CurveInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [artistImage, setArtistImage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/curve/${mint}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setCurve(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mint]);

  useEffect(() => {
    if (!curve?.uri?.startsWith("https://")) return;
    fetch(`/api/fetch-metadata?url=${encodeURIComponent(curve.uri)}`)
      .then(r => r.json())
      .then(data => setArtistImage(data.image ?? curve.uri))
      .catch(() => setArtistImage(curve.uri));
  }, [curve?.uri]);

  const artistUrl = `https://fanstake.app/artist/${mint}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!curve) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-gray-500 text-sm">
        Token not found
      </div>
    );
  }

  const vSol = Number(curve.virtualSolReserves);
  const vTokens = Number(curve.virtualTokenReserves);
  const totalSupply = Number(curve.totalSupply);
  const realTokenReserves = Number(curve.realTokenReserves);
  const price = vTokens > 0 ? (vSol / vTokens) * 1e6 : 0; // lamports per 1 token
  const pctSold = Math.min(((totalSupply - realTokenReserves) / totalSupply) * 100, 100);
  const imageUrl = artistImage;
  const verified = isVerified(mint);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-3">
      <div className="w-full max-w-sm bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">

        {/* Artist header */}
        <div className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl font-bold flex-shrink-0 overflow-hidden">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={curve.name} className="w-full h-full object-cover" />
            ) : (
              curve.name[0]
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-white font-bold text-sm truncate">{curve.name}</span>
              {verified && (
                <span className="text-xs bg-green-900/60 text-green-400 border border-green-700 px-1.5 py-0.5 rounded-full">✓</span>
              )}
            </div>
            <p className="text-gray-400 text-xs">${curve.symbol}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-white font-mono text-xs font-bold">{fmtPrice(price)}</p>
            <p className="text-gray-500 text-xs">per token</p>
          </div>
        </div>

        {/* Bonding curve progress */}
        <div className="px-4 pb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Tokens sold</span>
            <span>{pctSold.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
              style={{ width: `${pctSold}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">Earlier you buy · lower the price</p>
        </div>

        {/* CTA */}
        <div className="px-4 pb-4">
          <a
            href={artistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2.5 text-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-sm rounded-xl transition"
          >
            Buy ${curve.symbol} on FanStake ↗
          </a>
        </div>

        {/* Footer */}
        <div className="px-4 pb-3 text-center">
          <a
            href="https://fanstake.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-700 hover:text-gray-500 transition"
          >
            Powered by FanStake
          </a>
        </div>
      </div>
    </div>
  );
}
