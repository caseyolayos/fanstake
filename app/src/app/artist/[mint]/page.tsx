"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { Header } from "../../../components/Header";
import { useWallet, useConnection } from "../../../components/WalletProvider";
import { WalletButton } from "../../../components/WalletButton";
import {
  useProgram,
  getBondingCurvePDA,
  getCurveVaultPDA,
  getFeeVaultPDA,
  getPlatformConfigPDA,
} from "../../../hooks/useProgram";
import { isVerified, getVerifiedInfo } from "../../../lib/verified";
import { BondingCurveChart } from "../../../components/BondingCurveChart";
import { HolderGate, GatingConfig } from "../../../components/HolderGate";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActivityItem {
  type: "buy" | "sell";
  wallet: string;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  sig: string;
}

interface ArtistMetadata {
  image: string | null;
  description: string | null;
  spotify: string | null;
  soundcloud: string | null;
  audius: string | null;
  instagram: string | null;
  twitter: string | null;
  gating: GatingConfig | null;
}

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
  createdAt: BN;
  bump: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function calcPrice(curve: CurveData): number {
  const vSol = curve.virtualSolReserves.toNumber();
  const vTokens = curve.virtualTokenReserves.toNumber();
  return vTokens > 0 ? vSol / vTokens : 0;
}

function calcTokensOut(curve: CurveData, solLamports: number): number {
  const feeBps = 100; // 1%
  const fee = Math.floor((solLamports * feeBps) / 10_000);
  const solAfterFee = solLamports - fee;
  const vSol = curve.virtualSolReserves.toNumber();
  const vTokens = curve.virtualTokenReserves.toNumber();
  return Math.floor((solAfterFee * vTokens) / (vSol + solAfterFee));
}

function calcSolOut(curve: CurveData, tokenAmount: number): number {
  const vSol = curve.virtualSolReserves.toNumber();
  const vTokens = curve.virtualTokenReserves.toNumber();
  const rawSol = Math.floor((tokenAmount * vSol) / (vTokens + tokenAmount));
  const feeBps = 100;
  const fee = Math.floor((rawSol * feeBps) / 10_000);
  return rawSol - fee;
}

function fmtSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

function fmtTokens(raw: number): string {
  return (raw / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
      <p className="text-xs text-gray-500 uppercase mb-1">{label}</p>
      <p className="text-lg font-bold font-mono text-white">{value}</p>
    </div>
  );
}

type AudiusEmbed =
  | { type: "track" | "playlist"; embedUrl: string; title?: string; artist?: string }
  | { type: "profile"; profileUrl: string; name?: string; handle?: string; followerCount?: number; coverPhoto?: string | null }
  | { type: "link"; profileUrl: string }
  | null;

function MusicPlayer({
  spotify,
  soundcloud,
  audius,
}: {
  spotify?: string | null;
  soundcloud?: string | null;
  audius?: string | null;
}) {
  const [audiusData, setAudiusData] = useState<AudiusEmbed>(null);
  const [audiusLoading, setAudiusLoading] = useState(false);

  useEffect(() => {
    if (!audius) return;
    setAudiusLoading(true);
    fetch(`/api/fetch-audius-embed?url=${encodeURIComponent(audius)}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setAudiusData(d); })
      .catch(() => setAudiusData({ type: "link", profileUrl: audius }))
      .finally(() => setAudiusLoading(false));
  }, [audius]);

  const spotifyEmbed = spotify?.includes("open.spotify.com")
    ? spotify.replace("open.spotify.com/", "open.spotify.com/embed/").split("?")[0]
    : null;

  const soundcloudEmbed = soundcloud
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloud)}&auto_play=false&visual=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`
    : null;

  const tabs = [
    spotifyEmbed && "spotify",
    soundcloudEmbed && "soundcloud",
    (audius || audiusData) && "audius",
  ].filter(Boolean) as string[];

  const [tab, setTab] = useState<string>("");
  useEffect(() => { if (!tab && tabs.length) setTab(tabs[0]); }, [tabs.join(",")]); // eslint-disable-line

  if (!tabs.length) return null;

  const tabColors: Record<string, string> = {
    spotify: "bg-green-600",
    soundcloud: "bg-orange-500",
    audius: "bg-purple-600",
  };
  const tabLabels: Record<string, string> = {
    spotify: "🎧 Spotify",
    soundcloud: "☁️ SoundCloud",
    audius: "◈ Audius",
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <h3 className="text-sm font-bold text-gray-300 mb-4">🎵 Listen</h3>
      {tabs.length > 1 && (
        <div className="flex gap-2 mb-4">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-xs rounded-lg transition ${
                tab === t ? `${tabColors[t]} text-white` : "text-gray-400 border border-gray-700 hover:text-white"
              }`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </div>
      )}

      {tab === "spotify" && spotifyEmbed && (
        <iframe
          src={spotifyEmbed}
          width="100%"
          height="352"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="rounded-xl"
        />
      )}
      {tab === "soundcloud" && soundcloudEmbed && (
        <iframe
          width="100%"
          height="300"
          scrolling="no"
          frameBorder="no"
          allow="autoplay"
          src={soundcloudEmbed}
          className="rounded-xl"
        />
      )}
      {tab === "audius" && (
        audiusLoading ? (
          <div className="flex items-center justify-center h-24 text-gray-500 text-sm">Loading Audius...</div>
        ) : audiusData?.type === "track" || audiusData?.type === "playlist" ? (
          <iframe
            src={audiusData.embedUrl}
            width="100%"
            height="130"
            frameBorder="0"
            allow="autoplay"
            loading="lazy"
            className="rounded-xl"
          />
        ) : audiusData?.type === "profile" || audiusData?.type === "link" ? (
          <a
            href={"profileUrl" in audiusData ? audiusData.profileUrl : audius!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 bg-purple-900/20 border border-purple-700/50 rounded-xl hover:border-purple-500 transition group"
          >
            {"coverPhoto" in audiusData && audiusData.coverPhoto && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={audiusData.coverPhoto} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">
                {"name" in audiusData && audiusData.name ? audiusData.name : "Listen on Audius"}
              </p>
              {"handle" in audiusData && audiusData.handle && (
                <p className="text-purple-400 text-xs">@{audiusData.handle}</p>
              )}
              {"followerCount" in audiusData && audiusData.followerCount ? (
                <p className="text-gray-500 text-xs mt-0.5">{audiusData.followerCount.toLocaleString()} followers</p>
              ) : null}
            </div>
            <span className="text-purple-400 group-hover:text-purple-200 text-sm flex-shrink-0">↗</span>
          </a>
        ) : null
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ArtistPage() {
  const params = useParams();
  const mintStr = params.mint as string;
  const program = useProgram();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const editFileRef = useRef<HTMLInputElement>(null);
  const [curve, setCurve] = useState<CurveData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Trade state
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [solInput, setSolInput] = useState(""); // for buy (in SOL)
  const [tokenInput, setTokenInput] = useState(""); // for sell (in tokens)
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [lastPurchaseTokens, setLastPurchaseTokens] = useState<number>(0);
  const [lastPurchaseSol, setLastPurchaseSol] = useState<number>(0);
  const [lastPurchaseDate, setLastPurchaseDate] = useState<string>("");

  // User balances
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [showOnRamp, setShowOnRamp] = useState(false);

  // Holder count
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [topHolders, setTopHolders] = useState<{ wallet: string; amount: number; pct: number }[]>([]);

  // Activity feed
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Artist metadata (fetched from URI JSON)
  const [artistMeta, setArtistMeta] = useState<ArtistMetadata | null>(null);

  // Edit image state (artist only)
  const [editOpen, setEditOpen] = useState(false);
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch curve
  // ---------------------------------------------------------------------------
  const fetchCurve = useCallback(async () => {
    try {
      const mintPubkey = new PublicKey(mintStr);
      const [bondingCurvePDA] = getBondingCurvePDA(mintPubkey);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const acc = await (program.account as any).bondingCurve.fetch(bondingCurvePDA);
      setCurve(acc as CurveData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPageError("Failed to load artist: " + msg);
    } finally {
      setPageLoading(false);
    }
  }, [mintStr, program]);

  const fetchUserBalances = useCallback(async () => {
    if (!publicKey) return;
    try {
      const sol = await connection.getBalance(publicKey);
      setSolBalance(sol / LAMPORTS_PER_SOL);
    } catch { /* ignore */ }
    try {
      const mintPubkey = new PublicKey(mintStr);
      const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);
      const tokenAcc = await connection.getTokenAccountBalance(ata);
      setTokenBalance(tokenAcc.value.uiAmount ?? 0);
    } catch {
      setTokenBalance(0);
    }
  }, [publicKey, mintStr, connection]);

  const fetchHolderCount = useCallback(async () => {
    try {
      const mintPubkey = new PublicKey(mintStr);
      // Fetch all SPL token accounts for this mint (dataSize=165, memcmp on mint address)
      const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
        dataSlice: { offset: 64, length: 8 }, // only fetch the amount (u64 at offset 64)
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
        ],
      });
      // Count accounts with non-zero balance (any non-zero byte = balance > 0)
      const holders = accounts.filter(({ account }) => {
        const data = account.data as Buffer;
        return data.some((b: number) => b !== 0);
      }).length;
      setHolderCount(holders);
    } catch { /* ignore */ }
  }, [mintStr, connection]);

  const fetchTopHolders = useCallback(async () => {
    try {
      const res = await fetch(`/api/holders/${mintStr}`);
      const data = await res.json();
      if (data.holders) setTopHolders(data.holders.slice(0, 5));
    } catch { /* ignore */ }
  }, [mintStr]);

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/activity/${mintStr}`);
      const data = await res.json();
      if (data.activities) setActivity(data.activities);
    } catch { /* ignore */ } finally {
      setActivityLoading(false);
    }
  }, [mintStr]);

  useEffect(() => { fetchCurve(); }, [fetchCurve]);
  useEffect(() => { fetchUserBalances(); }, [fetchUserBalances]);
  useEffect(() => { fetchHolderCount(); }, [fetchHolderCount]);
  useEffect(() => { fetchTopHolders(); }, [fetchTopHolders]);
  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  // Fetch artist metadata JSON from URI
  useEffect(() => {
    if (!curve?.uri?.startsWith("https://")) return;
    fetch(`/api/fetch-metadata?url=${encodeURIComponent(curve.uri)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        // Parse gating config if present and valid
        let gating: GatingConfig | null = null;
        if (data.gating && typeof data.gating.threshold === "number" && Array.isArray(data.gating.perks)) {
          gating = { threshold: data.gating.threshold, perks: data.gating.perks };
        }
        setArtistMeta({
          image: data.image ?? null,
          description: data.description ?? null,
          spotify: data.properties?.links?.spotify ?? null,
          soundcloud: data.properties?.links?.soundcloud ?? null,
          audius: data.properties?.links?.audius ?? null,
          instagram: data.properties?.links?.instagram ?? null,
          twitter: data.properties?.links?.twitter ?? null,
          gating,
        });
      })
      .catch(() => {
        // URI is probably a direct image URL (legacy tokens) — treat it as image
        setArtistMeta({
          image: curve.uri,
          description: null,
          spotify: null,
          soundcloud: null,
          audius: null,
          instagram: null,
          twitter: null,
          gating: null,
        });
      });
  }, [curve?.uri]);

  // ---------------------------------------------------------------------------
  // Update image (artist only)
  // ---------------------------------------------------------------------------
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewImageFile(file);
    setNewImagePreview(URL.createObjectURL(file));
    setUpdateError(null);
  };

  const handleUpdateImage = async () => {
    if (!publicKey || !signTransaction || !newImageFile || !curve) return;
    setUpdateLoading(true);
    setUpdateError(null);
    setUpdateSuccess(false);

    try {
      // Compress
      const compressed = await new Promise<Blob>((resolve) => {
        const img = new window.Image();
        const url = URL.createObjectURL(newImageFile);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 800;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round((height / width) * MAX); width = MAX; }
            else { width = Math.round((width / height) * MAX); height = MAX; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
          canvas.toBlob((b) => resolve(b ?? newImageFile), "image/jpeg", 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(newImageFile); };
        img.src = url;
      });

      // Upload to CDN
      const fd = new FormData();
      fd.append("image", compressed, "artist.jpg");
      const uploadRes = await fetch("/api/upload-image", { method: "POST", body: fd });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error ?? "Image upload failed");
      const newUri: string = uploadData.url;

      // Call updateArtistToken on-chain
      const mintPubkey = new PublicKey(mintStr);
      const [bondingCurvePDA] = getBondingCurvePDA(mintPubkey);

      const updateIx = await program.methods
        .updateArtistToken(newUri)
        .accounts({ bondingCurve: bondingCurvePDA, artist: publicKey })
        .instruction();

      const tx = new Transaction();
      tx.add(updateIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      setUpdateSuccess(true);
      setEditOpen(false);
      setNewImageFile(null);
      setNewImagePreview(null);
      await fetchCurve(); // refresh to show new image
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdateLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Buy
  // ---------------------------------------------------------------------------
  const MIN_BUY_SOL = 0.001; // below this, curve vault can't meet rent-exempt minimum on first buy

  const handleBuy = async () => {
    if (!publicKey || !curve) return;
    const solAmt = parseFloat(solInput);
    if (isNaN(solAmt) || solAmt <= 0) return;
    if (solAmt < MIN_BUY_SOL) {
      setTxError(`Minimum buy is ${MIN_BUY_SOL} SOL`);
      return;
    }

    setTxLoading(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      const mintPubkey = new PublicKey(mintStr);
      const [bondingCurve] = getBondingCurvePDA(mintPubkey);
      const [platformConfig] = getPlatformConfigPDA();
      const [curveVault] = getCurveVaultPDA(mintPubkey);
      const [feeVault] = getFeeVaultPDA();
      const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);

      const tx = new Transaction();

      // Create ATA if needed
      const ataInfo = await connection.getAccountInfo(ata);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey, ata, publicKey, mintPubkey
          )
        );
      }

      const solLamports = new BN(Math.floor(solAmt * LAMPORTS_PER_SOL));

      const buyIx = await program.methods
        .buy(solLamports, new BN(0))
        .accounts({
          bondingCurve,
          platformConfig,
          mint: mintPubkey,
          user: publicKey,
          userTokenAccount: ata,
          curveVault,
          feeVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      tx.add(buyIx);

      if (!signTransaction) throw new Error("Wallet cannot sign transactions");
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Show success immediately — don't block on confirmation
      setTxSuccess(sig);
      setLastPurchaseTokens(calcTokensOut(curve, Math.floor(solAmt * LAMPORTS_PER_SOL)));
      setLastPurchaseSol(solAmt);
      setLastPurchaseDate(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
      setSolInput("");

      // Confirm in background with timeout; refresh data when done
      const confirmWithTimeout = Promise.race([
        connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 30_000)
        ),
      ]);

      confirmWithTimeout
        .then(() => Promise.all([fetchCurve(), fetchUserBalances(), fetchHolderCount(), fetchActivity()]))
        .catch(() => Promise.all([fetchCurve(), fetchUserBalances(), fetchHolderCount(), fetchActivity()]));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
    } finally {
      setTxLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Sell
  // ---------------------------------------------------------------------------
  const handleSell = async () => {
    if (!publicKey || !curve) return;
    const tokenAmt = parseFloat(tokenInput);
    if (isNaN(tokenAmt) || tokenAmt <= 0) return;

    setTxLoading(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      const mintPubkey = new PublicKey(mintStr);
      const [bondingCurve] = getBondingCurvePDA(mintPubkey);
      const [platformConfig] = getPlatformConfigPDA();
      const [curveVault] = getCurveVaultPDA(mintPubkey);
      const [feeVault] = getFeeVaultPDA();
      const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);

      const rawTokens = new BN(Math.floor(tokenAmt * 1_000_000)); // 6 decimals

      const tx = new Transaction();

      const sellIx = await program.methods
        .sell(rawTokens, new BN(0))
        .accounts({
          bondingCurve,
          platformConfig,
          mint: mintPubkey,
          user: publicKey,
          userTokenAccount: ata,
          curveVault,
          feeVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      tx.add(sellIx);

      if (!signTransaction) throw new Error("Wallet cannot sign transactions");
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Show success immediately — don't block on confirmation
      setTxSuccess(sig);
      setTokenInput("");

      // Confirm in background with timeout; refresh data when done
      const confirmWithTimeout = Promise.race([
        connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 30_000)
        ),
      ]);

      confirmWithTimeout
        .then(() => Promise.all([fetchCurve(), fetchUserBalances()]))
        .catch(() => Promise.all([fetchCurve(), fetchUserBalances()]));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTxError(msg);
    } finally {
      setTxLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (pageLoading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading artist data...</p>
        </div>
      </div>
    );
  }

  if (pageError || !curve) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Header />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-red-400 mb-4">{pageError ?? "Artist not found"}</p>
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm">← Back to Discover</Link>
        </div>
      </div>
    );
  }

  const price = calcPrice(curve);
  const verified = isVerified(mintStr);
  const verifiedInfo = getVerifiedInfo(mintStr);
  const realSolReserves = curve.realSolReserves.toNumber();
  const totalSupply = curve.totalSupply.toNumber();
  const realTokenReserves = curve.realTokenReserves.toNumber();
  // Use image from parsed metadata; fall back to direct URI for legacy tokens
  const imageUrl = artistMeta?.image ?? (curve.uri?.startsWith("http") ? curve.uri : null);

  // Preview calcs
  const solLamInput = parseFloat(solInput) > 0
    ? Math.floor(parseFloat(solInput) * LAMPORTS_PER_SOL) : 0;
  const tokensPreview = solLamInput > 0 ? calcTokensOut(curve, solLamInput) : 0;

  const tokenRawInput = parseFloat(tokenInput) > 0
    ? Math.floor(parseFloat(tokenInput) * 1_000_000) : 0;
  const solPreview = tokenRawInput > 0 ? calcSolOut(curve, tokenRawInput) : 0;

  return (
    <>
    <div className="min-h-screen bg-black text-white">
      <Header />

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Back */}
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-white transition mb-6 inline-flex items-center gap-1"
        >
          ← Discover
        </Link>

        {/* Artist header */}
        <div className="flex items-center gap-6 mb-8">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl font-bold flex-shrink-0 overflow-hidden">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={curve.name} className="w-full h-full object-cover" />
            ) : (
              curve.name[0]
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold">{curve.name}</h1>
              {verified ? (
                <span className="inline-flex items-center gap-1 text-xs bg-green-900/50 text-green-400 border border-green-700 px-2 py-0.5 rounded-full font-medium">
                  ✓ Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-2 py-0.5 rounded-full font-medium">
                  ⚠ Unverified
                </span>
              )}
            </div>
            <p className="text-gray-400 text-lg mt-1">
              ${curve.symbol}
              {verifiedInfo && (
                <a
                  href={`https://x.com/${verifiedInfo.twitterHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-blue-400 hover:text-blue-300"
                >
                  @{verifiedInfo.twitterHandle} ↗
                </a>
              )}
              {!curve.isActive && (
                <span className="ml-2 text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">
                  Inactive
                </span>
              )}
            </p>
            <div className="flex items-center gap-3 mt-2">
              {holderCount !== null && (
                <span className="inline-flex items-center gap-1 text-xs text-purple-400 bg-purple-900/30 border border-purple-800 px-2 py-0.5 rounded-full">
                  🎵 {holderCount} {holderCount === 1 ? "fan" : "fans"} holding
                </span>
              )}
              <p className="text-xs text-gray-600 font-mono">
                {mintStr.slice(0, 8)}...{mintStr.slice(-8)}
              </p>
            </div>
          </div>
        </div>

        {/* Artist tools — visible only to the token's artist */}
        {publicKey && curve.artist.toString() === publicKey.toString() && (
          <div className="mb-4">
            <Link
              href={`/dashboard/${mintStr}`}
              className="inline-flex items-center gap-2 text-xs bg-purple-900/30 border border-purple-700 hover:border-purple-500 text-purple-300 hover:text-purple-200 px-4 py-2 rounded-lg transition font-medium"
            >
              📊 Artist Dashboard — holders, volume, embed code
            </Link>
          </div>
        )}

        {/* Edit image — visible only to the token's artist */}
        {publicKey && curve.artist.toString() === publicKey.toString() && (
          <div className="mb-6">
            {!editOpen ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-xs text-purple-400 hover:text-purple-300 border border-purple-800 hover:border-purple-500 rounded-lg px-3 py-1.5 transition"
                >
                  ✏️ Edit Artist Image
                </button>
                {updateSuccess && (
                  <span className="text-xs text-green-400">✅ Image updated!</span>
                )}
              </div>
            ) : (
              <div className="bg-gray-900 border border-purple-800 rounded-2xl p-5 max-w-sm">
                <p className="text-sm font-bold mb-3 text-purple-300">Update Artist Image</p>
                <input
                  ref={editFileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <div
                  onClick={() => editFileRef.current?.click()}
                  className="w-24 h-24 rounded-full bg-gray-800 border-2 border-dashed border-gray-600 hover:border-purple-500 flex items-center justify-center cursor-pointer overflow-hidden mx-auto mb-4 transition"
                >
                  {newImagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={newImagePreview} alt="preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl">📷</span>
                  )}
                </div>
                {updateError && (
                  <p className="text-xs text-red-400 mb-3">{updateError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateImage}
                    disabled={updateLoading || !newImageFile}
                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                  >
                    {updateLoading ? "⏳ Saving..." : "Save Image"}
                  </button>
                  <button
                    onClick={() => { setEditOpen(false); setNewImageFile(null); setNewImagePreview(null); setUpdateError(null); }}
                    className="px-3 py-2 text-gray-400 hover:text-white border border-gray-700 rounded-lg text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trade-here banner */}
        <div className="mb-6 p-4 bg-purple-900/20 border border-purple-700/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-purple-400 text-lg flex-shrink-0">🔒</span>
            <div>
              <p className="text-sm text-purple-300 font-semibold">This token trades on FanStake only</p>
              <p className="text-xs text-purple-500 mt-0.5">
                ${curve.symbol} uses a custom bonding curve — it cannot be bought or sold on Jupiter, Raydium, or other DEXes.
                Use the panel on this page to trade.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="text-xs border border-purple-700 hover:border-purple-400 text-purple-400 hover:text-purple-200 px-3 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              📋 Copy link
            </button>
            <a
              href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                `Check out $${curve.symbol} by ${curve.name} on @FanStakeMusic 🎵\n\nInvest before the world catches on — bonding curve, Solana mainnet.\n\n${typeof window !== "undefined" ? window.location.href : `https://fanstake.app/artist/${mintStr}`}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-black border border-gray-600 hover:border-white text-white px-3 py-1.5 rounded-lg transition whitespace-nowrap"
            >
              𝕏 Share
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatBox
            label="Price"
            value={`${price.toFixed(8)} SOL`}
          />
          <StatBox
            label="Liquidity"
            value={`${fmtSol(realSolReserves)} SOL`}
          />
          <StatBox
            label="Tokens Left"
            value={`${fmtTokens(realTokenReserves)}`}
          />
          <StatBox
            label="Total Supply"
            value={`${fmtTokens(totalSupply)}`}
          />
        </div>

        {/* Verification disclaimer */}
        {!verified && (
          <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-xl flex gap-3">
            <span className="text-yellow-500 text-lg flex-shrink-0">⚠️</span>
            <div>
              <p className="text-sm text-yellow-300 font-medium">Unverified Artist</p>
              <p className="text-xs text-yellow-600 mt-0.5">
                This token was created by a user. FanStake has not verified that this
                represents the actual artist. Always check the artist&apos;s official
                social channels before investing.{" "}
                <a
                  href="https://x.com/fanstakemusic"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-500 hover:text-yellow-300 underline"
                >
                  How verification works ↗
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Artist bio */}
        {artistMeta?.description && (
          <div className="mb-6 p-5 bg-gray-900 border border-gray-800 rounded-2xl">
            <p className="text-sm text-gray-400 leading-relaxed">{artistMeta.description}</p>
          </div>
        )}

        {/* Music player — metadata links take priority; fall back to verified.ts for legacy tokens */}
        {(artistMeta?.spotify || artistMeta?.soundcloud || artistMeta?.audius ||
          verifiedInfo?.spotify || verifiedInfo?.soundcloud || verifiedInfo?.audius) && (
          <div className="mb-6">
            <MusicPlayer
              spotify={artistMeta?.spotify ?? verifiedInfo?.spotify}
              soundcloud={artistMeta?.soundcloud ?? verifiedInfo?.soundcloud}
              audius={artistMeta?.audius ?? verifiedInfo?.audius}
            />
          </div>
        )}

        {/* Token-Gated Content — only shown when artist has configured gating in their metadata */}
        {artistMeta?.gating && artistMeta.gating.perks.length > 0 && (
          <div className="mb-6">
            <HolderGate
              config={artistMeta.gating}
              symbol={curve.symbol}
              tokenBalance={tokenBalance}
              isWalletConnected={!!publicKey}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Trade Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="flex bg-gray-800 rounded-xl p-1 mb-5">
              {(["buy", "sell"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setTxError(null); setTxSuccess(null); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                    mode === m
                      ? m === "buy"
                        ? "bg-green-600 text-white"
                        : "bg-red-600 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {m === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>

            {/* Wallet info */}
            {publicKey ? (
              <div className="text-xs text-gray-500 mb-4 flex justify-between items-center">
                <span className="flex items-center gap-2">
                  SOL: {solBalance !== null ? solBalance.toFixed(4) : "..."}
                  <button
                    onClick={() => setShowOnRamp(true)}
                    className="text-purple-400 hover:text-purple-300 border border-purple-700 hover:border-purple-500 rounded px-1.5 py-0.5 transition text-xs"
                    title="Buy SOL with credit card"
                  >
                    💳 Get SOL
                  </button>
                </span>
                <span>{curve.symbol}: {tokenBalance !== null ? tokenBalance.toLocaleString() : "..."}</span>
              </div>
            ) : (
              <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg text-xs text-yellow-300 text-center">
                Connect wallet to trade
              </div>
            )}

            {mode === "buy" ? (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <label className="text-xs text-gray-500 uppercase">SOL to spend</label>
                    <span className="text-xs text-gray-600">Min: 0.001 SOL</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      placeholder="0.001"
                      value={solInput}
                      onChange={(e) => setSolInput(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono focus:border-green-500 focus:outline-none"
                    />
                    <span className="absolute right-4 top-3 text-gray-400 text-sm">SOL</span>
                  </div>
                  {/* Quick amounts */}
                  <div className="flex gap-2 mt-2">
                    {["0.01", "0.05", "0.1", "0.5"].map((v) => (
                      <button
                        key={v}
                        onClick={() => setSolInput(v)}
                        className="text-xs text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-2 py-1 transition"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                {tokensPreview > 0 && (
                  <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg p-3">
                    You receive ≈{" "}
                    <span className="text-white font-medium">
                      {fmtTokens(tokensPreview)} {curve.symbol}
                    </span>
                    <span className="text-gray-600 ml-1">(1% fee applied)</span>
                  </div>
                )}
                <button
                  onClick={handleBuy}
                  disabled={txLoading || !publicKey || !solInput}
                  className="w-full py-3 rounded-xl font-bold text-sm transition bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                >
                  {txLoading ? "⏳ Buying..." : `Buy ${curve.symbol}`}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 uppercase mb-1.5 block">
                    Tokens to sell
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono focus:border-red-500 focus:outline-none"
                    />
                    <span className="absolute right-4 top-3 text-gray-400 text-sm">{curve.symbol}</span>
                  </div>
                  {tokenBalance !== null && tokenBalance > 0 && (
                    <button
                      onClick={() => setTokenInput(tokenBalance.toString())}
                      className="text-xs text-gray-500 hover:text-white mt-1 transition"
                    >
                      Max: {tokenBalance.toLocaleString()}
                    </button>
                  )}
                </div>
                {solPreview > 0 && (
                  <div className="text-xs text-gray-400 bg-gray-800/50 rounded-lg p-3">
                    You receive ≈{" "}
                    <span className="text-white font-medium">
                      {fmtSol(solPreview)} SOL
                    </span>
                    <span className="text-gray-600 ml-1">(1% fee applied)</span>
                  </div>
                )}
                <button
                  onClick={handleSell}
                  disabled={txLoading || !publicKey || !tokenInput}
                  className="w-full py-3 rounded-xl font-bold text-sm transition bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                >
                  {txLoading ? "⏳ Selling..." : `Sell ${curve.symbol}`}
                </button>
              </div>
            )}

            {/* Wallet connect button if not connected */}
            {!publicKey && (
              <div className="mt-4 flex justify-center">
                <WalletButton />
              </div>
            )}

            {/* Feedback */}
            {txError && (
              <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg text-xs text-red-300">
                {txError}
                {(txError.toLowerCase().includes("insufficient") || txError.toLowerCase().includes("funds") || txError.toLowerCase().includes("lamport")) && (
                  <button
                    onClick={() => setShowOnRamp(true)}
                    className="mt-2 w-full py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium transition"
                  >
                    💳 Get SOL with Card
                  </button>
                )}
              </div>
            )}
            {txSuccess && (
              <div className="mt-3 rounded-2xl overflow-hidden border border-purple-700/50 bg-gradient-to-br from-gray-900 via-purple-950/20 to-gray-900">
                {/* Receipt header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">🎫 Fan Receipt</span>
                  <span className="text-xs text-gray-500">{lastPurchaseDate}</span>
                </div>

                {/* Artist info */}
                <div className="flex items-center gap-3 px-4 py-2">
                  {artistMeta?.image ? (
                    <img src={artistMeta.image} alt={curve.name} className="w-10 h-10 rounded-full object-cover border border-purple-700/50" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-purple-800/40 flex items-center justify-center text-lg">🎵</div>
                  )}
                  <div>
                    <p className="text-white font-bold text-sm">{curve.name}</p>
                    <p className="text-purple-400 text-xs font-mono">${curve.symbol}</p>
                  </div>
                </div>

                {/* Purchase details */}
                <div className="mx-4 my-2 bg-black/40 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Tokens received</span>
                    <span className="text-white font-mono font-bold">{fmtTokens(lastPurchaseTokens)} ${curve.symbol}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">SOL paid</span>
                    <span className="text-white font-mono">{lastPurchaseSol} SOL</span>
                  </div>
                  {holderCount !== null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">You are fan</span>
                      <span className="text-green-400 font-bold">#{holderCount} 🔥</span>
                    </div>
                  )}
                </div>

                {/* Early believer badge */}
                {holderCount !== null && holderCount <= 100 && (
                  <div className="mx-4 mb-2 flex items-center gap-2 bg-yellow-900/20 border border-yellow-700/40 rounded-xl px-3 py-2">
                    <span className="text-lg">⭐</span>
                    <div>
                      <p className="text-yellow-400 text-xs font-bold">Early Believer</p>
                      <p className="text-yellow-600 text-xs">You&apos;re one of the first {holderCount} fans</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
                  <a
                    href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                      `just became an early believer in $${curve.symbol} 🎵\n\nbought ${fmtTokens(lastPurchaseTokens)} tokens on @FanStakeMusic\n\nif they blow up, i win with them 🚀\n\n${typeof window !== "undefined" ? window.location.href : ""}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-black border border-gray-600 hover:border-white text-white rounded-xl px-3 py-2.5 transition font-medium text-sm"
                  >
                    <span>𝕏</span> Share your receipt
                  </a>
                  <a
                    href={`https://explorer.solana.com/tx/${txSuccess}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-xs text-gray-600 hover:text-gray-400 transition"
                  >
                    View on Solana Explorer ↗
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Token Info Panel */}
          <div className="space-y-4">
            {/* Bonding Curve Chart */}
            <BondingCurveChart
              virtualSolReserves={curve.virtualSolReserves.toNumber()}
              virtualTokenReserves={curve.virtualTokenReserves.toNumber()}
              totalSupply={totalSupply}
              symbol={curve.symbol}
            />

            {/* Top Fans Leaderboard */}
            {topHolders.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                  👑 Top Fans
                  <span className="text-xs text-gray-600 font-normal">biggest believers</span>
                </h3>
                <div className="space-y-2">
                  {topHolders.map((h, i) => (
                    <div key={h.wallet} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm w-5 text-center ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-600"}`}>
                          {i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                        </span>
                        <a
                          href={`https://explorer.solana.com/address/${h.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono text-gray-400 hover:text-white transition"
                        >
                          {h.wallet}
                        </a>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-white font-mono">{h.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        <p className="text-xs text-gray-600">{h.pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reserve details */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-gray-500">Virtual SOL</p>
                <p className="text-white font-mono">{fmtSol(curve.virtualSolReserves.toNumber())}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-gray-500">Real SOL</p>
                <p className="text-white font-mono">{fmtSol(realSolReserves)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-gray-500">Artist Share</p>
                <p className="text-white font-mono">{(curve.artistShareBps / 100).toFixed(1)}%</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-gray-500">Platform Fee</p>
                <p className="text-white font-mono">1%</p>
              </div>
            </div>

            {/* Addresses */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-gray-300 mb-3">Contract Info</h3>
              <div className="space-y-2 text-xs font-mono">
                {[
                  { label: "Mint", value: mintStr },
                  { label: "Artist", value: curve.artist.toString() },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-gray-500 mb-0.5">{label}</p>
                    <a
                      href={`https://explorer.solana.com/address/${value}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 break-all"
                    >
                      {value.slice(0, 16)}...{value.slice(-8)} ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-300 mb-3">Recent Activity</h3>
          {activityLoading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-gray-500 text-sm">
              Loading activity...
            </div>
          ) : activity.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-gray-600 text-sm">
              No trades yet — be the first fan to buy in 🎵
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {activity.map((item, i) => (
                <div
                  key={item.sig}
                  className={`flex items-center justify-between px-5 py-3 text-sm ${
                    i < activity.length - 1 ? "border-b border-gray-800" : ""
                  }`}
                >
                  {/* Type indicator + wallet */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.type === "buy" ? "bg-green-500" : "bg-red-500"}`} />
                    <a
                      href={`https://explorer.solana.com/tx/${item.sig}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-white font-mono text-xs transition"
                    >
                      {item.wallet}
                    </a>
                    <span className={`text-xs font-medium ${item.type === "buy" ? "text-green-400" : "text-red-400"}`}>
                      {item.type === "buy" ? "bought" : "sold"}
                    </span>
                    <span className="text-white font-mono text-xs truncate">
                      {item.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${curve.symbol}
                    </span>
                  </div>

                  {/* SOL amount + time */}
                  <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                    <span className="text-gray-400 text-xs font-mono">
                      {item.solAmount.toFixed(4)} SOL
                    </span>
                    <span className="text-gray-600 text-xs">
                      {timeAgo(item.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>

    {/* Fiat On-Ramp Modal */}
    {showOnRamp && typeof window !== "undefined" && ReactDOM.createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={() => { setShowOnRamp(false); fetchUserBalances(); }}
      >
        <div
          className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
            <div>
              <p className="text-white font-semibold text-sm">Get SOL with Card</p>
              <p className="text-gray-400 text-xs mt-0.5">Buy SOL to trade on FanStake</p>
            </div>
            <button
              onClick={() => { setShowOnRamp(false); fetchUserBalances(); }}
              className="text-gray-500 hover:text-white text-xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Coinbase Onramp */}
          <div className="w-full px-5 py-6 flex flex-col items-center gap-5">
            {/* Coinbase branding */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">C</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Coinbase Onramp</p>
                <p className="text-gray-400 text-xs">Powered by Coinbase · Trusted by millions</p>
              </div>
            </div>

            {/* What you get */}
            <div className="w-full bg-gray-900 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm text-gray-300">
                <span className="text-green-400">✓</span> Apple Pay, debit &amp; credit cards accepted
              </div>
              <div className="flex items-center gap-2.5 text-sm text-gray-300">
                <span className="text-green-400">✓</span> SOL delivered to your wallet instantly
              </div>
              <div className="flex items-center gap-2.5 text-sm text-gray-300">
                <span className="text-green-400">✓</span> Your wallet address pre-filled
              </div>
              <div className="flex items-center gap-2.5 text-sm text-gray-300">
                <span className="text-green-400">✓</span> $5 minimum · up to $2,500/week
              </div>
            </div>

            {/* Wallet address preview */}
            {publicKey && (
              <div className="w-full bg-gray-900 rounded-xl px-4 py-3">
                <p className="text-gray-500 text-xs mb-1">Sending SOL to</p>
                <p className="text-gray-300 text-xs font-mono truncate">{publicKey.toString()}</p>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => {
                const wallet = publicKey?.toString() ?? "";
                const destinations = encodeURIComponent(
                  JSON.stringify([{ address: wallet, blockchains: ["solana"], assets: ["SOL"] }])
                );
                const appId = process.env.NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID;
                if (!appId) {
                  // Fallback: open Coinbase SOL buy page without pre-fill
                  window.open("https://www.coinbase.com/how-to-buy/solana", "_blank", "noopener");
                  return;
                }
                const url = `https://pay.coinbase.com/buy/select-asset?appId=${appId}&destinationWallets=${destinations}&defaultAsset=SOL&defaultNetwork=solana`;
                window.open(url, "_blank", "width=460,height=700,noopener");
              }}
              className="w-full py-3.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-2"
            >
              Continue to Coinbase →
            </button>

            <p className="text-gray-600 text-xs text-center">
              Opens in a new window. Return here when done.
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-800">
            <button
              onClick={() => { setShowOnRamp(false); fetchUserBalances(); }}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition"
            >
              Done — I've topped up ✓
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
