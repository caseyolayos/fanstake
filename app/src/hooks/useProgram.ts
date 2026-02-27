"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "../components/WalletProvider";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Fanstake } from "../lib/fanstake";
import idl from "../lib/fanstake.json";

export const PROGRAM_ID = new PublicKey(
  "JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf"
);

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo(() => {
    // Read-only provider — works without a wallet for fetching accounts
    const readOnlyWallet = {
      publicKey: wallet.publicKey ?? PublicKey.default,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signTransaction: wallet.signTransaction ?? (async (tx: any) => tx),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signAllTransactions: wallet.signAllTransactions ?? (async (txs: any[]) => txs),
    };

    const provider = new AnchorProvider(connection, readOnlyWallet, {
      commitment: "confirmed",
    });
    setProvider(provider);

    return new Program(idl as Fanstake, provider);
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  return program;
}

// PDA helpers
export function getBondingCurvePDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    PROGRAM_ID
  );
}

export function getPlatformConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("platform_config")],
    PROGRAM_ID
  );
}

export function getCurveVaultPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("curve_vault"), mint.toBuffer()],
    PROGRAM_ID
  );
}

export function getFeeVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    PROGRAM_ID
  );
}

export function getArtistVestingPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("artist_vesting"), mint.toBuffer()],
    PROGRAM_ID
  );
}
