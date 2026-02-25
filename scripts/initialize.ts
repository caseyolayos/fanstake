import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const idl = require("../target/idl/fanstake.json");

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const programId = new PublicKey("JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new anchor.Program(idl as any, provider) as any;

  const [platformConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_config")],
    programId
  );

  const [feeVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    programId
  );

  console.log("Program ID:", programId.toString());
  console.log("Platform Config PDA:", platformConfig.toString());
  console.log("Fee Vault PDA:      ", feeVault.toString());
  console.log("Authority:          ", provider.wallet.publicKey.toString());

  // Check if already initialized
  try {
    const existing = await program.account.platformConfig.fetchNullable(platformConfig);
    if (existing) {
      console.log("\n✅ Platform already initialized!");
      console.log("  Fee BPS:        ", existing.feeBps);
      console.log("  Fee Vault:      ", existing.feeVault.toString());
      console.log("  Total Artists:  ", existing.totalArtists.toString());
      return;
    }
  } catch {
    // not initialized
  }

  console.log("\nInitializing platform config (100 bps = 1% fee)...");

  const tx = await program.methods
    .initialize(100)
    .accounts({
      platformConfig,
      feeVault,
      authority: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Initialized! Tx:", tx);
}

main().catch(console.error);
