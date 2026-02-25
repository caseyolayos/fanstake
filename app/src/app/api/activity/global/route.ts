import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const HELIUS_RPC = process.env.HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";
const PROGRAM_ID = "JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf";
const BONDING_CURVE_DISC = Buffer.from([23, 183, 248, 55, 96, 216, 172, 96]); // sha256("account:BondingCurve")[0:8]

function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

export interface GlobalActivityItem {
  type: "buy" | "sell";
  wallet: string;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  sig: string;
  mint: string;
  symbol?: string;
  artistName?: string;
}

export async function GET() {
  try {
    const connection = new Connection(HELIUS_RPC, "confirmed");

    // Fetch all bonding curve accounts
    const programId = new PublicKey(PROGRAM_ID);
    const allAccounts = await connection.getProgramAccounts(programId, {
      filters: [{ memcmp: { offset: 0, bytes: "4y6pru6YvC7" } }], // base58 of BondingCurve discriminator
      encoding: "base64",
    });

    // Get mint from each bonding curve (offset 8 = after discriminator, mint is 32 bytes)
    const mints: string[] = [];
    for (const acc of allAccounts) {
      try {
        const data = Buffer.isBuffer(acc.account.data)
          ? acc.account.data as Buffer
          : Buffer.from((acc.account.data as unknown as [string, string])[0], "base64");
        if (data.length < 72) continue;
        const mintBytes = data.slice(40, 72); // [8 disc][32 artist][32 mint]
        const mint = new PublicKey(mintBytes).toBase58();
        // Verify this is a valid PDA
        const expectedPDA = getBondingCurvePDA(new PublicKey(mint));
        if (expectedPDA.toBase58() === acc.pubkey.toBase58()) {
          mints.push(mint);
        }
      } catch {
        continue;
      }
    }

    // Fetch recent activity for each mint (limit to avoid timeout)
    const allActivity: GlobalActivityItem[] = [];
    const mintLimit = Math.min(mints.length, 10); // cap at 10 artists for speed

    await Promise.all(
      mints.slice(0, mintLimit).map(async (mint) => {
        try {
          const mintPubkey = new PublicKey(mint);
          const bondingCurvePDA = getBondingCurvePDA(mintPubkey);
          const sigs = await connection.getSignaturesForAddress(bondingCurvePDA, { limit: 10 });

          for (const sigInfo of sigs.slice(0, 5)) {
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

            const preToken = tx.meta.preTokenBalances?.find(b => b.mint === mint && b.owner === feePayer);
            const postToken = tx.meta.postTokenBalances?.find(b => b.mint === mint && b.owner === feePayer);
            const tokenDelta = (postToken?.uiTokenAmount?.uiAmount ?? 0) - (preToken?.uiTokenAmount?.uiAmount ?? 0);
            if (Math.abs(tokenDelta) < 0.01) continue;

            const preSol = tx.meta.preBalances[0] ?? 0;
            const postSol = tx.meta.postBalances[0] ?? 0;
            const solDelta = Math.abs(preSol - postSol) / 1e9;

            allActivity.push({
              type: tokenDelta > 0 ? "buy" : "sell",
              wallet: `${feePayer.slice(0, 4)}...${feePayer.slice(-4)}`,
              tokenAmount: Math.abs(tokenDelta),
              solAmount: solDelta,
              timestamp: sigInfo.blockTime ?? 0,
              sig: sigInfo.signature,
              mint,
            });
          }
        } catch { /* skip failed mints */ }
      })
    );

    // Sort by most recent and return top 20
    allActivity.sort((a, b) => b.timestamp - a.timestamp);
    return NextResponse.json({ activities: allActivity.slice(0, 20) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
