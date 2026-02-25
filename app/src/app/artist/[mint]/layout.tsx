import { Metadata } from "next";

const APP_URL = "https://fanstake.app";
const PROGRAM_ID = "JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf";
const HELIUS_RPC = process.env.HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";
const FALLBACK_IMAGE = `${APP_URL}/icon.png`;

// ---------------------------------------------------------------------------
// Minimal Solana/Anchor fetch without importing the full browser-side stack
// ---------------------------------------------------------------------------
async function fetchCurveData(mint: string) {
  // Use the existing API route — it handles Solana RPC + Anchor parsing
  const res = await fetch(`${APP_URL}/api/curve/${mint}`, {
    next: { revalidate: 60 }, // re-fetch at most once per minute
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    name: string;
    symbol: string;
    uri: string;
    virtualSolReserves: string;
    virtualTokenReserves: string;
    realSolReserves: string;
  }>;
}

async function resolveArtistImage(uri: string): Promise<string> {
  if (!uri?.startsWith("https://")) return FALLBACK_IMAGE;
  // Direct image URL (legacy tokens)
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(uri)) return uri;
  // Try parsing as metadata JSON
  try {
    const res = await fetch(uri, { next: { revalidate: 3600 } });
    const meta = await res.json();
    if (typeof meta?.image === "string" && meta.image.startsWith("http")) return meta.image;
  } catch { /* ignore */ }
  return FALLBACK_IMAGE;
}

// ---------------------------------------------------------------------------
// Price helper: same formula as the client-side calcPrice()
// ---------------------------------------------------------------------------
function calcPrice(vSol: string, vTokens: string): number {
  const s = Number(vSol);
  const t = Number(vTokens);
  return t > 0 ? s / t : 0;
}

// ---------------------------------------------------------------------------
// generateMetadata — called at request time on the edge/server
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>;
}): Promise<Metadata> {
  const { mint } = await params;

  const curve = await fetchCurveData(mint);
  if (!curve) {
    return {
      title: "Artist Token | FanStake",
      description: "Invest in music artists on FanStake. Powered by Solana.",
    };
  }

  const imageUrl = await resolveArtistImage(curve.uri);
  const price = calcPrice(curve.virtualSolReserves, curve.virtualTokenReserves);
  const pageUrl = `${APP_URL}/artist/${mint}`;

  const title = `${curve.name} ($${curve.symbol}) | FanStake`;
  const description =
    `Invest in ${curve.name} on FanStake. ` +
    `Current price: ${price.toFixed(8)} SOL. ` +
    `Buy early on a Solana bonding curve — the earlier you invest, the lower the price.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "FanStake",
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 400,
          height: 400,
          alt: `${curve.name} artist token`,
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [imageUrl],
      site: "@FanStakeMusic",
      creator: "@FanStakeMusic",
    },
    alternates: {
      canonical: pageUrl,
    },
  };
}

// ---------------------------------------------------------------------------
// Layout wrapper — just passes children through
// ---------------------------------------------------------------------------
export default function ArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
