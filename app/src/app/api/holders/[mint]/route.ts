import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const HELIUS_RPC = process.env.HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";
const PROGRAM_ID = "JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf";

function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

export interface HolderItem {
  wallet: string;
  amount: number;          // human-readable tokens (divided by 1e6)
  pct: number;             // % of total supply
  rank: number;            // 1-indexed position
  hasSold: boolean;        // any sell tx detected
  firstBuyTimestamp: number | null; // unix seconds of first buy
  totalSolSpent: number;   // SOL spent buying (approximate from activity)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await params;
    const connection = new Connection(HELIUS_RPC, "confirmed");
    const mintPubkey = new PublicKey(mint);
    const bondingCurvePDA = getBondingCurvePDA(mintPubkey);

    // 1. Fetch token holder accounts
    const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { dataSize: 165 },
        { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
      ],
    });

    // Parse amount and owner
    const rawHolders = accounts
      .map((acc) => {
        const data = acc.account.data as Buffer;
        const ownerBytes = data.slice(32, 64);
        const wallet = new PublicKey(ownerBytes).toBase58();
        const low = data.readUInt32LE(64);
        const high = data.readUInt32LE(68);
        const raw = high * 0x100000000 + low;
        const amount = raw / 1_000_000;
        return { wallet, amount };
      })
      .filter((h) => h.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    // 2. Fetch recent activity to detect sells and first buy times
    // We look at the last 50 txs on the bonding curve PDA
    const walletStats: Record<string, { hasSold: boolean; firstBuyTimestamp: number | null; totalSolSpent: number }> = {};

    try {
      const sigs = await connection.getSignaturesForAddress(bondingCurvePDA, { limit: 50 });
      for (const sigInfo of sigs) {
        if (sigInfo.err) continue;
        let tx;
        try {
          tx = await connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });
        } catch { continue; }
        if (!tx?.meta || !tx?.transaction) continue;

        const accounts = tx.transaction.message.accountKeys;
        const feePayer = accounts[0]?.pubkey?.toString();
        if (!feePayer) continue;

        if (!walletStats[feePayer]) {
          walletStats[feePayer] = { hasSold: false, firstBuyTimestamp: null, totalSolSpent: 0 };
        }

        // Detect buy vs sell via token balance delta
        const preTokenBals = tx.meta.preTokenBalances ?? [];
        const postTokenBals = tx.meta.postTokenBalances ?? [];

        let tokenDeltaForPayer = 0;
        for (const post of postTokenBals) {
          if (post.mint !== mint) continue;
          const owner = post.owner ?? accounts[post.accountIndex]?.pubkey?.toString();
          if (owner !== feePayer) continue;
          const pre = preTokenBals.find(
            (p) => p.accountIndex === post.accountIndex
          );
          const preAmt = pre?.uiTokenAmount?.uiAmount ?? 0;
          const postAmt = post.uiTokenAmount?.uiAmount ?? 0;
          tokenDeltaForPayer += postAmt - preAmt;
        }

        // SOL delta for fee payer
        const preSol = tx.meta.preBalances[0] ?? 0;
        const postSol = tx.meta.postBalances[0] ?? 0;
        const solDelta = (postSol - preSol) / 1e9; // negative = spent SOL (buy)

        const ts = tx.blockTime ?? null;

        if (tokenDeltaForPayer > 0) {
          // Buy
          const solSpent = Math.abs(solDelta);
          walletStats[feePayer].totalSolSpent += solSpent;
          if (ts !== null) {
            if (walletStats[feePayer].firstBuyTimestamp === null || ts < walletStats[feePayer].firstBuyTimestamp!) {
              walletStats[feePayer].firstBuyTimestamp = ts;
            }
          }
        } else if (tokenDeltaForPayer < 0) {
          // Sell
          walletStats[feePayer].hasSold = true;
        }
      }
    } catch {
      // Activity enrichment is best-effort; continue with holders
    }

    // 3. Build final holders list with rank + badge data
    const total = rawHolders.reduce((s, h) => s + h.amount, 0);
    const holders: HolderItem[] = rawHolders.map((h, i) => {
      const stats = walletStats[h.wallet] ?? { hasSold: false, firstBuyTimestamp: null, totalSolSpent: 0 };
      return {
        ...h,
        pct: total > 0 ? (h.amount / total) * 100 : 0,
        rank: i + 1,
        hasSold: stats.hasSold,
        firstBuyTimestamp: stats.firstBuyTimestamp,
        totalSolSpent: stats.totalSolSpent,
      };
    });

    return NextResponse.json({ holders, total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
