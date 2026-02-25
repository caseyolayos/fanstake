import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const HELIUS_RPC = process.env.HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";

export interface HolderItem {
  wallet: string;
  amount: number; // human-readable tokens (divided by 1e6)
  pct: number;    // % of total supply
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await params;
    const connection = new Connection(HELIUS_RPC, "confirmed");
    const mintPubkey = new PublicKey(mint);

    const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        { dataSize: 165 },
        { memcmp: { offset: 0, bytes: mintPubkey.toBase58() } },
      ],
    });

    // Parse amount (u64 little-endian at offset 64) and owner (bytes 32–63)
    const holders: HolderItem[] = accounts
      .map((acc) => {
        const data = acc.account.data as Buffer;
        const ownerBytes = data.slice(32, 64);
        const wallet = new PublicKey(ownerBytes).toBase58();
        // Read u64 little-endian at offset 64
        const low = data.readUInt32LE(64);
        const high = data.readUInt32LE(68);
        const raw = high * 0x100000000 + low;
        const amount = raw / 1_000_000; // 6 decimals
        return { wallet, amount, pct: 0 };
      })
      .filter((h) => h.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);

    // Calculate total for % share
    const total = holders.reduce((s, h) => s + h.amount, 0);
    holders.forEach((h) => {
      h.pct = total > 0 ? (h.amount / total) * 100 : 0;
    });

    return NextResponse.json({ holders, total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
