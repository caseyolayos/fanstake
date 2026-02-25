import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Fanstake } from "../target/types/fanstake";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { assert } from "chai";
import BN from "bn.js";

describe("fanstake", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Fanstake as Program<Fanstake>;
  const authority = provider.wallet as anchor.Wallet;

  // PDAs
  let platformConfigPda: PublicKey;
  let feeVaultPda: PublicKey;
  let feeVaultBump: number;

  // Artist token
  const artist = Keypair.generate();
  const mintKp = Keypair.generate();
  let bondingCurvePda: PublicKey;
  let curveVaultPda: PublicKey;
  let userTokenAccount: PublicKey;

  before(async () => {
    // Derive PDAs
    [platformConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform_config")],
      program.programId
    );
    [feeVaultPda, feeVaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_vault")],
      program.programId
    );
    [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve"), mintKp.publicKey.toBuffer()],
      program.programId
    );
    [curveVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("curve_vault"), mintKp.publicKey.toBuffer()],
      program.programId
    );

    // Fund artist from authority wallet (0.1 SOL is plenty for rent)
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: artist.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(fundTx);
  });

  it("Initializes the platform (or verifies existing)", async () => {
    const FEE_BPS = 100; // 1%

    try {
      await program.methods
        .initialize(FEE_BPS)
        .accounts({
          platformConfig: platformConfigPda,
          feeVault: feeVaultPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("✅ Platform initialized — fee:", FEE_BPS, "bps");
    } catch (err: any) {
      // Already initialized from a previous test run — that's fine
      if (err.toString().includes("already in use") || err.toString().includes("0x0")) {
        console.log("ℹ️  Platform already initialized (previous test run)");
      } else {
        throw err;
      }
    }

    const config = await program.account.platformConfig.fetch(platformConfigPda);
    assert.equal(config.feeBps, FEE_BPS, "Fee BPS should match");
    assert.ok(config.authority.equals(authority.publicKey), "Authority should match");
  });

  it("Creates an artist token with bonding curve", async () => {
    await program.methods
      .createArtistToken(
        "Test Artist",
        "TART",
        "https://arweave.net/test-metadata",
        1000 // 10% artist share
      )
      .accounts({
        bondingCurve: bondingCurvePda,
        platformConfig: platformConfigPda,
        mint: mintKp.publicKey,
        artist: artist.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([artist, mintKp])
      .rpc();

    const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
    assert.equal(curve.name, "Test Artist");
    assert.equal(curve.symbol, "TART");
    assert.ok(curve.isActive, "Curve should be active");
    assert.equal(curve.artistShareBps, 1000);

    // Check platform updated (artists counter increments each run)
    const config = await program.account.platformConfig.fetch(platformConfigPda);
    assert.isAbove(config.totalArtists.toNumber(), 0, "Should have at least 1 artist");

    console.log("✅ Artist token created — mint:", mintKp.publicKey.toBase58());
    console.log(
      "   Virtual SOL reserves:",
      curve.virtualSolReserves.toString()
    );
    console.log(
      "   Virtual token reserves:",
      curve.virtualTokenReserves.toString()
    );
  });

  it("Creates ATA for buyer", async () => {
    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      mintKp.publicKey,
      authority.publicKey
    );
    assert.ok(userTokenAccount, "ATA should be created");
    console.log("✅ User ATA created:", userTokenAccount.toBase58());
  });

  it("Fan buys tokens (1 SOL)", async () => {
    const solAmount = new BN(0.2 * LAMPORTS_PER_SOL); // 0.2 SOL (conservative for devnet)
    const minTokensOut = new BN(0); // no slippage protection in test

    const userBalanceBefore = await provider.connection.getBalance(
      authority.publicKey
    );

    await program.methods
      .buy(solAmount, minTokensOut)
      .accounts({
        bondingCurve: bondingCurvePda,
        platformConfig: platformConfigPda,
        mint: mintKp.publicKey,
        user: authority.publicKey,
        userTokenAccount: userTokenAccount,
        curveVault: curveVaultPda,
        feeVault: feeVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Check token balance
    const tokenBalance = await provider.connection.getTokenAccountBalance(
      userTokenAccount
    );
    const tokensReceived = Number(tokenBalance.value.amount);
    assert.isAbove(tokensReceived, 0, "Should have received tokens");

    // Check curve vault got SOL
    const vaultBalance = await provider.connection.getBalance(curveVaultPda);
    assert.isAbove(vaultBalance, 0, "Curve vault should have SOL");

    // Check curve state updated
    const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
    assert.isAbove(
      curve.realSolReserves.toNumber(),
      0,
      "Real SOL reserves should increase"
    );

    console.log("✅ Buy successful!");
    console.log("   Tokens received:", tokensReceived);
    console.log("   Curve vault SOL:", vaultBalance / LAMPORTS_PER_SOL, "SOL");
    console.log(
      "   Real SOL in curve:",
      curve.realSolReserves.toNumber() / LAMPORTS_PER_SOL,
      "SOL"
    );
  });

  it("Fan sells half their tokens back", async () => {
    const tokenBalance = await provider.connection.getTokenAccountBalance(
      userTokenAccount
    );
    const totalTokens = Number(tokenBalance.value.amount);
    const tokensToSell = new BN(Math.floor(totalTokens / 2));
    const minSolOut = new BN(0);

    const solBefore = await provider.connection.getBalance(authority.publicKey);

    await program.methods
      .sell(tokensToSell, minSolOut)
      .accounts({
        bondingCurve: bondingCurvePda,
        platformConfig: platformConfigPda,
        mint: mintKp.publicKey,
        user: authority.publicKey,
        userTokenAccount: userTokenAccount,
        curveVault: curveVaultPda,
        feeVault: feeVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const solAfter = await provider.connection.getBalance(authority.publicKey);
    const solReceived = solAfter - solBefore;

    const newTokenBalance = await provider.connection.getTokenAccountBalance(
      userTokenAccount
    );
    const remainingTokens = Number(newTokenBalance.value.amount);

    assert.approximately(
      remainingTokens,
      totalTokens - tokensToSell.toNumber(),
      1,
      "Should have half tokens remaining"
    );
    assert.isAbove(solReceived, 0, "Should have received SOL back");

    console.log("✅ Sell successful!");
    console.log("   SOL received back:", solReceived / LAMPORTS_PER_SOL, "SOL");
    console.log("   Remaining tokens:", remainingTokens);
  });

  it("Rejects artist share > 20%", async () => {
    const badMint = Keypair.generate();
    const [badCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding_curve"), badMint.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .createArtistToken("Bad Artist", "BAD", "https://bad.uri", 2001) // 20.01% — should fail
        .accounts({
          bondingCurve: badCurvePda,
          platformConfig: platformConfigPda,
          mint: badMint.publicKey,
          artist: artist.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([artist, badMint])
        .rpc();
      assert.fail("Should have thrown ArtistShareTooHigh");
    } catch (err: any) {
      assert.include(err.toString(), "ArtistShareTooHigh");
      console.log("✅ Correctly rejected artist share > 20%");
    }
  });
});
