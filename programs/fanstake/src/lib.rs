use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo};

declare_id!("JCAt7JFiHxMBQ9TcEZYbWkp2GZpF3ZbdYdwD5ZBP6Nkf");

/// FanStake — The stock market for music artists.
/// Artists launch personal tokens on Solana via a bonding curve.
/// Fans buy/sell tokens; price moves along the curve.

#[program]
pub mod fanstake {
    use super::*;

    /// Initialize the platform config (one-time, by admin).
    pub fn initialize(ctx: Context<Initialize>, platform_fee_bps: u16) -> Result<()> {
        let config = &mut ctx.accounts.platform_config;
        config.authority = ctx.accounts.authority.key();
        config.fee_bps = platform_fee_bps; // e.g., 100 = 1%
        config.fee_vault = ctx.accounts.fee_vault.key();
        config.total_artists = 0;
        Ok(())
    }

    /// An artist creates their personal token with a bonding curve.
    pub fn create_artist_token(
        ctx: Context<CreateArtistToken>,
        name: String,
        symbol: String,
        uri: String,           // metadata URI (IPFS)
        artist_share_bps: u16, // artist's share of initial supply in basis points (e.g., 1000 = 10%)
    ) -> Result<()> {
        require!(name.len() <= 32, FanStakeError::NameTooLong);
        require!(symbol.len() <= 10, FanStakeError::SymbolTooLong);
        require!(artist_share_bps <= 2000, FanStakeError::ArtistShareTooHigh); // max 20%

        let curve = &mut ctx.accounts.bonding_curve;
        curve.artist = ctx.accounts.artist.key();
        curve.mint = ctx.accounts.mint.key();
        curve.name = name;
        curve.symbol = symbol;
        curve.uri = uri;
        curve.virtual_sol_reserves = 30_000_000_000; // 30 SOL virtual reserves (like pump.fun)
        curve.virtual_token_reserves = 1_073_000_000_000_000; // ~1.073B tokens virtual
        curve.real_sol_reserves = 0;
        curve.real_token_reserves = 793_100_000_000_000; // ~793.1M real tokens available
        curve.total_supply = 1_000_000_000_000_000; // 1B tokens (6 decimals)
        curve.artist_share_bps = artist_share_bps;
        curve.is_active = true;
        curve.created_at = Clock::get()?.unix_timestamp;
        curve.bump = ctx.bumps.bonding_curve;

        // Update platform stats
        let config = &mut ctx.accounts.platform_config;
        config.total_artists += 1;

        msg!("Artist token created: {} ({})", curve.name, curve.symbol);
        Ok(())
    }

    /// Artist updates their token's metadata URI (e.g. to fix an image).
    /// Only the original artist wallet can call this.
    pub fn update_artist_token(ctx: Context<UpdateArtistToken>, new_uri: String) -> Result<()> {
        require!(new_uri.len() <= 200, FanStakeError::UriTooLong);
        ctx.accounts.bonding_curve.uri = new_uri;
        Ok(())
    }

    /// Fan buys artist tokens by sending SOL.
    pub fn buy(ctx: Context<BuySell>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
        // Extract values before mutable borrow
        let curve_bump = ctx.accounts.bonding_curve.bump;
        let curve_mint = ctx.accounts.bonding_curve.mint;
        let fee_bps = ctx.accounts.platform_config.fee_bps as u64;

        require!(ctx.accounts.bonding_curve.is_active, FanStakeError::CurveNotActive);
        require!(sol_amount > 0, FanStakeError::InvalidAmount);

        // Calculate platform fee
        let fee = sol_amount.checked_mul(fee_bps).unwrap().checked_div(10_000).unwrap();
        let sol_after_fee = sol_amount.checked_sub(fee).unwrap();

        // Calculate tokens out using constant product formula
        let tokens_out = {
            let curve = &ctx.accounts.bonding_curve;
            (sol_after_fee as u128)
                .checked_mul(curve.virtual_token_reserves as u128)
                .unwrap()
                .checked_div(
                    (curve.virtual_sol_reserves as u128)
                        .checked_add(sol_after_fee as u128)
                        .unwrap(),
                )
                .unwrap() as u64
        };

        require!(tokens_out >= min_tokens_out, FanStakeError::SlippageExceeded);
        require!(tokens_out <= ctx.accounts.bonding_curve.real_token_reserves, FanStakeError::InsufficientTokens);

        // Update curve state
        {
            let curve = &mut ctx.accounts.bonding_curve;
            curve.virtual_sol_reserves = curve.virtual_sol_reserves.checked_add(sol_after_fee).unwrap();
            curve.virtual_token_reserves = curve.virtual_token_reserves.checked_sub(tokens_out).unwrap();
            curve.real_sol_reserves = curve.real_sol_reserves.checked_add(sol_after_fee).unwrap();
            curve.real_token_reserves = curve.real_token_reserves.checked_sub(tokens_out).unwrap();
        }

        // Transfer SOL from buyer to curve vault
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.curve_vault.to_account_info(),
                },
            ),
            sol_after_fee,
        )?;

        // Transfer fee to platform vault
        if fee > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.user.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        // Mint tokens to buyer (PDA signs)
        let seeds: &[&[u8]] = &[b"bonding_curve", curve_mint.as_ref(), &[curve_bump]];
        let signer_seeds = &[seeds];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
                signer_seeds,
            ),
            tokens_out,
        )?;

        msg!("BUY: {} SOL -> {} tokens (fee: {} SOL)", sol_after_fee, tokens_out, fee);
        Ok(())
    }

    /// Fan sells artist tokens back for SOL.
    pub fn sell(ctx: Context<BuySell>, token_amount: u64, min_sol_out: u64) -> Result<()> {
        // Extract values before mutable borrow
        let curve_mint = ctx.accounts.bonding_curve.mint;
        let fee_bps = ctx.accounts.platform_config.fee_bps as u64;
        let vault_bump = ctx.bumps.curve_vault;

        require!(ctx.accounts.bonding_curve.is_active, FanStakeError::CurveNotActive);
        require!(token_amount > 0, FanStakeError::InvalidAmount);

        // Calculate SOL out using constant product formula
        let sol_out_gross = {
            let curve = &ctx.accounts.bonding_curve;
            (token_amount as u128)
                .checked_mul(curve.virtual_sol_reserves as u128)
                .unwrap()
                .checked_div(
                    (curve.virtual_token_reserves as u128)
                        .checked_add(token_amount as u128)
                        .unwrap(),
                )
                .unwrap() as u64
        };

        // Calculate platform fee
        let fee = sol_out_gross.checked_mul(fee_bps).unwrap().checked_div(10_000).unwrap();
        let sol_out = sol_out_gross.checked_sub(fee).unwrap();

        require!(sol_out >= min_sol_out, FanStakeError::SlippageExceeded);
        require!(sol_out_gross <= ctx.accounts.bonding_curve.real_sol_reserves, FanStakeError::InsufficientSol);

        // Update curve state
        {
            let curve = &mut ctx.accounts.bonding_curve;
            curve.virtual_sol_reserves = curve.virtual_sol_reserves.checked_sub(sol_out_gross).unwrap();
            curve.virtual_token_reserves = curve.virtual_token_reserves.checked_add(token_amount).unwrap();
            curve.real_sol_reserves = curve.real_sol_reserves.checked_sub(sol_out_gross).unwrap();
            curve.real_token_reserves = curve.real_token_reserves.checked_add(token_amount).unwrap();
        }

        // Burn tokens from seller
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            token_amount,
        )?;

        // Transfer SOL to seller from curve vault (PDA-signed CPI)
        let vault_seeds: &[&[u8]] = &[b"curve_vault", curve_mint.as_ref(), &[vault_bump]];
        let signer_seeds = &[vault_seeds];

        anchor_lang::system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.curve_vault.to_account_info(),
                    to: ctx.accounts.user.to_account_info(),
                },
                signer_seeds,
            ),
            sol_out,
        )?;

        // Transfer fee to platform vault
        if fee > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.curve_vault.to_account_info(),
                        to: ctx.accounts.fee_vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee,
            )?;
        }

        msg!("SELL: {} tokens -> {} SOL (fee: {} SOL)", token_amount, sol_out, fee);
        Ok(())
    }
}

// ============================================================
// ACCOUNTS
// ============================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + PlatformConfig::INIT_SPACE,
        seeds = [b"platform_config"],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    /// CHECK: Fee vault PDA
    #[account(
        seeds = [b"fee_vault"],
        bump,
    )]
    pub fee_vault: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateArtistToken<'info> {
    #[account(
        init,
        payer = artist,
        space = 8 + BondingCurve::INIT_SPACE,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(mut)]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(
        init,
        payer = artist,
        mint::decimals = 6,
        mint::authority = bonding_curve,
    )]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub artist: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UpdateArtistToken<'info> {
    #[account(
        mut,
        seeds = [b"bonding_curve", bonding_curve.mint.as_ref()],
        bump = bonding_curve.bump,
        has_one = artist, // only the original artist can update
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    pub artist: Signer<'info>,
}

#[derive(Accounts)]
pub struct BuySell<'info> {
    #[account(
        mut,
        seeds = [b"bonding_curve", mint.key().as_ref()],
        bump = bonding_curve.bump,
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
    #[account(
        seeds = [b"platform_config"],
        bump,
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    /// CHECK: Curve vault PDA holds SOL
    #[account(
        mut,
        seeds = [b"curve_vault", mint.key().as_ref()],
        bump,
    )]
    pub curve_vault: AccountInfo<'info>,
    /// CHECK: Platform fee vault
    #[account(
        mut,
        address = platform_config.fee_vault,
    )]
    pub fee_vault: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ============================================================
// STATE
// ============================================================

#[account]
#[derive(InitSpace)]
pub struct PlatformConfig {
    pub authority: Pubkey,      // Platform admin
    pub fee_bps: u16,           // Platform fee in basis points (100 = 1%)
    pub fee_vault: Pubkey,      // Where fees go
    pub total_artists: u64,     // Counter
}

#[account]
#[derive(InitSpace)]
pub struct BondingCurve {
    pub artist: Pubkey,                   // Artist's wallet
    pub mint: Pubkey,                     // Token mint address
    #[max_len(32)]
    pub name: String,                     // Artist/token name
    #[max_len(10)]
    pub symbol: String,                   // Token symbol
    #[max_len(200)]
    pub uri: String,                      // Metadata URI
    pub virtual_sol_reserves: u64,        // Virtual SOL in the curve
    pub virtual_token_reserves: u64,      // Virtual tokens in the curve
    pub real_sol_reserves: u64,           // Actual SOL locked
    pub real_token_reserves: u64,         // Actual tokens available
    pub total_supply: u64,                // Total token supply
    pub artist_share_bps: u16,           // Artist's allocation (basis points)
    pub is_active: bool,                  // Is the curve active?
    pub created_at: i64,                  // Unix timestamp
    pub bump: u8,                         // PDA bump
}

// ============================================================
// ERRORS
// ============================================================

#[error_code]
pub enum FanStakeError {
    #[msg("Name must be 32 characters or less.")]
    NameTooLong,
    #[msg("Symbol must be 10 characters or less.")]
    SymbolTooLong,
    #[msg("URI must be 200 characters or less.")]
    UriTooLong,
    #[msg("Artist share cannot exceed 20%.")]
    ArtistShareTooHigh,
    #[msg("Bonding curve is not active.")]
    CurveNotActive,
    #[msg("Amount must be greater than zero.")]
    InvalidAmount,
    #[msg("Slippage tolerance exceeded.")]
    SlippageExceeded,
    #[msg("Insufficient tokens in the curve.")]
    InsufficientTokens,
    #[msg("Insufficient SOL in the curve.")]
    InsufficientSol,
}
