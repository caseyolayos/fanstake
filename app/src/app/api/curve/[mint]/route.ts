import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import IDL from "../../../../lib/fanstake.json";

const HELIUS_RPC = process.env.HELIUS_RPC ?? "https://mainnet.helius-rpc.com/?api-key=2c39db04-894b-42b5-a2c2-4ddf59c6adef";
const PROGRAM_ID = "JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf";

function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
  return pda;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await params;
    const connection = new Connection(HELIUS_RPC, "confirmed");
    const kp = Keypair.generate();
    // Minimal read-only wallet (no signing needed)
    const dummyWallet = {
      publicKey: kp.publicKey,
      signTransaction: async (tx: unknown) => tx,
      signAllTransactions: async (txs: unknown[]) => txs,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const program = new Program(IDL as any, provider);

    const mintPubkey = new PublicKey(mint);
    const bondingCurvePDA = getBondingCurvePDA(mintPubkey);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acc = await (program.account as any).bondingCurve.fetch(bondingCurvePDA);

    return NextResponse.json({
      name: acc.name,
      symbol: acc.symbol,
      uri: acc.uri,
      artist: acc.artist.toString(),
      virtualSolReserves: (acc.virtualSolReserves as BN).toString(),
      virtualTokenReserves: (acc.virtualTokenReserves as BN).toString(),
      realSolReserves: (acc.realSolReserves as BN).toString(),
      realTokenReserves: (acc.realTokenReserves as BN).toString(),
      totalSupply: (acc.totalSupply as BN).toString(),
      artistShareBps: acc.artistShareBps,
      isActive: acc.isActive,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
