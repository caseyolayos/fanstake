import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const HELIUS_RPC = process.env.HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";
const FEE_WALLET = "6GCUMDXVwqVZUuQCQxA8yXwTk3hyXdfdvu8RXFSRNb25";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const BOOST_TIERS: Record<string, { durationMs: number; solAmount: number }> = {
  basic: { durationMs: 24 * 60 * 60 * 1000, solAmount: 0.25 },
  prime: { durationMs: 48 * 60 * 60 * 1000, solAmount: 0.5 },
};

export interface ActiveBoost {
  mint: string;
  tier: "basic" | "prime";
  payer: string;
  expiresAt: number; // unix ms
  txSig: string;
}

export async function GET() {
  try {
    const connection = new Connection(HELIUS_RPC, "confirmed");
    const feeWallet = new PublicKey(FEE_WALLET);

    // Fetch last 50 txs to the fee wallet
    const sigs = await connection.getSignaturesForAddress(feeWallet, { limit: 50 });
    const nowMs = Date.now();
    const active: ActiveBoost[] = [];

    for (const sigInfo of sigs) {
      if (sigInfo.err) continue;

      let tx;
      try {
        tx = await connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
      } catch { continue; }

      if (!tx?.blockTime || !tx?.transaction || !tx?.meta) continue;

      const blockTimeMs = tx.blockTime * 1000;
      const payer = tx.transaction.message.accountKeys[0]?.pubkey?.toString();
      if (!payer) continue;

      // Parse memo instructions
      let memoText: string | null = null;
      const instructions = tx.transaction.message.instructions;
      for (const ix of instructions) {
        if ("programId" in ix && ix.programId.toString() === MEMO_PROGRAM) {
          // Parsed memo instruction
          if ("parsed" in ix && typeof ix.parsed === "string") {
            memoText = ix.parsed;
          }
        }
      }
      if (!memoText?.startsWith("fanstake-boost:")) continue;

      // Parse memo: fanstake-boost:{mint}:{tier}
      const parts = memoText.split(":");
      if (parts.length !== 3) continue;
      const mint = parts[1];
      const tier = parts[2] as "basic" | "prime";
      if (!BOOST_TIERS[tier]) continue;

      // Verify SOL amount transferred to fee wallet
      const accounts = tx.transaction.message.accountKeys;
      const feeWalletIndex = accounts.findIndex(k => k.pubkey.toString() === FEE_WALLET);
      if (feeWalletIndex === -1) continue;

      const preBalance = tx.meta.preBalances[feeWalletIndex] ?? 0;
      const postBalance = tx.meta.postBalances[feeWalletIndex] ?? 0;
      const receivedSol = (postBalance - preBalance) / 1e9;

      const expected = BOOST_TIERS[tier].solAmount;
      // Allow ±5% tolerance for rounding
      if (receivedSol < expected * 0.95) continue;

      // Check if still active
      const expiresAt = blockTimeMs + BOOST_TIERS[tier].durationMs;
      if (nowMs > expiresAt) continue;

      active.push({ mint, tier, payer, expiresAt, txSig: sigInfo.signature });
    }

    return NextResponse.json({ boosts: active });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
