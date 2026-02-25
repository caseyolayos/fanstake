/**
 * Initialize FanStake platform config on mainnet.
 * Run: npx ts-node scripts/init-mainnet.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3 } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { Fanstake } from "../target/types/fanstake";
import idl from "../target/idl/fanstake.json";

const PROGRAM_ID = new PublicKey("JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf");
const FEE_BPS = 100; // 1%

async function main() {
  // Load wallet from default keypair
  const wallet = anchor.Wallet.local();
  console.log("Authority wallet:", wallet.publicKey.toString());

  // Connect to mainnet
  const connection = new web3.Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl as any, provider) as Program<Fanstake>;

  // Derive PDAs
  const [platformConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_config")],
    PROGRAM_ID
  );
  const [feeVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    PROGRAM_ID
  );

  console.log("Platform Config PDA:", platformConfigPda.toString());
  console.log("Fee Vault PDA:", feeVaultPda.toString());

  // Check if already initialized
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (program.account as any).platformConfig.fetch(platformConfigPda);
    console.log("✅ Already initialized!");
    console.log("  Fee BPS:", existing.feeBps);
    console.log("  Authority:", existing.authority.toString());
    console.log("  Fee Vault:", existing.feeVault.toString());
    console.log("  Total Artists:", existing.totalArtists.toString());
    return;
  } catch {
    console.log("Not yet initialized — running initialize...");
  }

  const tx = await program.methods
    .initialize(FEE_BPS)
    .accounts({
      platformConfig: platformConfigPda,
      feeVault: feeVaultPda,
      authority: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Platform initialized on MAINNET!");
  console.log("  Tx:", tx);
  console.log("  Platform Config:", platformConfigPda.toString());
  console.log("  Fee Vault:", feeVaultPda.toString());
  console.log("  Fee:", FEE_BPS, "bps (1%)");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
