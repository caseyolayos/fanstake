import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const HELIUS_RPC = process.env.HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";
const PROGRAM_ID = "JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf";

function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

export interface ActivityItem {
  type: "buy" | "sell";
  wallet: string;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  sig: string;
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

    // Fetch recent signatures for the bonding curve account
    const sigs = await connection.getSignaturesForAddress(bondingCurvePDA, {
      limit: 20,
    });

    const activities: ActivityItem[] = [];

    for (const sigInfo of sigs) {
      if (sigInfo.err) continue;

      let tx;
      try {
        tx = await connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
      } catch {
        continue;
      }

      if (!tx?.meta || !tx?.transaction) continue;

      const accounts = tx.transaction.message.accountKeys;
      const feePayer = accounts[0]?.pubkey?.toString();
      if (!feePayer) continue;

      // Find token balance delta for this mint owned by feePayer
      const preToken = tx.meta.preTokenBalances?.find(
        (b) => b.mint === mint && b.owner === feePayer
      );
      const postToken = tx.meta.postTokenBalances?.find(
        (b) => b.mint === mint && b.owner === feePayer
      );

      const preTokenAmt = preToken?.uiTokenAmount?.uiAmount ?? 0;
      const postTokenAmt = postToken?.uiTokenAmount?.uiAmount ?? 0;
      const tokenDelta = postTokenAmt - preTokenAmt;

      // Skip if no meaningful token change (e.g. createArtistToken tx)
      if (Math.abs(tokenDelta) < 0.01) continue;

      // SOL delta for feePayer (excludes tx fee by using index 0 pre/post)
      const preSol = tx.meta.preBalances[0] ?? 0;
      const postSol = tx.meta.postBalances[0] ?? 0;
      const solDelta = Math.abs(preSol - postSol) / 1e9;

      activities.push({
        type: tokenDelta > 0 ? "buy" : "sell",
        wallet: `${feePayer.slice(0, 4)}...${feePayer.slice(-4)}`,
        tokenAmount: Math.abs(tokenDelta),
        solAmount: solDelta,
        timestamp: sigInfo.blockTime ?? 0,
        sig: sigInfo.signature,
      });

      if (activities.length >= 10) break;
    }

    return NextResponse.json({ activities });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
