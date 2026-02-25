/**
 * Initialize FanStake platform config on mainnet.
 * Run: node scripts/init-mainnet.js
 */
const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram } = require("@solana/web3.js");

const PROGRAM_ID = new PublicKey("JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf");
const FEE_BPS = 100; // 1%

async function main() {
  const wallet = anchor.Wallet.local();
  console.log("Authority wallet:", wallet.publicKey.toString());

  const connection = new anchor.web3.Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = require("../target/idl/fanstake.json");
  const program = new anchor.Program(idl, provider);

  const [platformConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("platform_config")],
    PROGRAM_ID
  );
  const [feeVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")],
    PROGRAM_ID
  );

  console.log("Platform Config PDA:", platformConfigPda.toString());
  console.log("Fee Vault PDA:      ", feeVaultPda.toString());

  // Check if already initialized
  try {
    const existing = await program.account.platformConfig.fetch(platformConfigPda);
    console.log("\n✅ Already initialized!");
    console.log("  Fee BPS:       ", existing.feeBps);
    console.log("  Authority:     ", existing.authority.toString());
    console.log("  Fee Vault:     ", existing.feeVault.toString());
    console.log("  Total Artists: ", existing.totalArtists.toString());
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

  console.log("\n✅ Platform initialized on MAINNET!");
  console.log("  Tx:             ", tx);
  console.log("  Platform Config:", platformConfigPda.toString());
  console.log("  Fee Vault:      ", feeVaultPda.toString());
  console.log("  Fee:            ", FEE_BPS, "bps (1%)");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
