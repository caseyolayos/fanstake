import { NextRequest, NextResponse } from "next/server";

const HELIUS_KEY =
  (process.env.HELIUS_RPC ?? "").split("api-key=")[1] ??
  "2c39db04-894b-42b5-a2c2-4ddf59c6adef";

const FANSTAKE_PROGRAM = "JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf";

export interface PositionData {
  mint: string;
  totalSolSpentLamports: number;
  totalTokensBought: number;
  avgEntryPriceLamports: number; // lamports per raw token unit
  buyCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isInvolvingFanStake(tx: any): boolean {
  return (tx.instructions ?? []).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (i: any) =>
      i.programId === FANSTAKE_PROGRAM ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (i.innerInstructions ?? []).some((ii: any) => ii.programId === FANSTAKE_PROGRAM)
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;

  try {
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_KEY}&limit=100`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return NextResponse.json({});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txs: any[] = await res.json();
    if (!Array.isArray(txs)) return NextResponse.json({});

    const positions: Record<string, PositionData> = {};

    for (const tx of txs) {
      if (!isInvolvingFanStake(tx)) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accountData: any[] = tx.accountData ?? [];

      // ── 1. Find tokens received by wallet (top-level tokenTransfers) ──────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokenTransfers: any[] = tx.tokenTransfers ?? [];
      const gains = tokenTransfers.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.toUserAccount === wallet && t.tokenAmount > 0
      );

      if (gains.length === 0) continue; // not a buy for this wallet

      // ── 2. Get raw token amounts from ATA accountData ─────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gainsWithRaw = gains.map((t: any) => {
        // Find the ATA that holds tokens for this mint + user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ataEntry = accountData.find((a: any) =>
          (a.tokenBalanceChanges ?? []).some(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tc: any) => tc.mint === t.mint && tc.userAccount === wallet
          )
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tc = ataEntry?.tokenBalanceChanges?.find((tc: any) => tc.mint === t.mint);
        const rawAmount = tc
          ? parseInt(tc.rawTokenAmount.tokenAmount)
          : Math.round(t.tokenAmount * 1_000_000); // fallback: UI amount × 6 decimals

        return { mint: t.mint as string, rawAmount };
      });

      // ── 3. Accurate cost basis: SOL that went to program accounts ─────────
      // Exclude: wallet itself, ATA accounts (they have tokenBalanceChanges),
      // and accounts that received 0 or negative SOL.
      // What remains = curve_vault + fee_vault = actual buy cost.
      const solToProgramAccounts = accountData
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((a: any) =>
          a.account !== wallet &&
          a.nativeBalanceChange > 0 &&
          (!a.tokenBalanceChanges || a.tokenBalanceChanges.length === 0)
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((sum: number, a: any) => sum + a.nativeBalanceChange, 0);

      if (solToProgramAccounts === 0) continue;

      const solPerMint = gains.length > 0 ? solToProgramAccounts / gains.length : solToProgramAccounts;

      for (const gain of gainsWithRaw) {
        if (!positions[gain.mint]) {
          positions[gain.mint] = {
            mint: gain.mint,
            totalSolSpentLamports: 0,
            totalTokensBought: 0,
            avgEntryPriceLamports: 0,
            buyCount: 0,
          };
        }
        positions[gain.mint].totalSolSpentLamports += solPerMint;
        positions[gain.mint].totalTokensBought += gain.rawAmount;
        positions[gain.mint].buyCount += 1;
      }
    }

    // ── Compute avg entry price per mint ──────────────────────────────────
    for (const pos of Object.values(positions)) {
      if (pos.totalTokensBought > 0) {
        pos.avgEntryPriceLamports =
          pos.totalSolSpentLamports / pos.totalTokensBought;
      }
    }

    return NextResponse.json(positions);
  } catch (err) {
    console.error("[portfolio API]", err);
    return NextResponse.json({});
  }
}
