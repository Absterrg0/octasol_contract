use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount, Token};
use crate::state::Bounty;

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct CompleteBounty<'info> {
    #[account(
        mut,
        has_one = maintainer,
            close = maintainer,  // Rent-exempt SOL goes to maintainer on completion
        seeds = [b"bounty", bounty_id.to_le_bytes().as_ref()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(mut)]
    pub maintainer: Signer<'info>,

    /// CHECK: Contributor is validated by bounty.contributor field 
    #[account(mut)]
    pub contributor: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bounty,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = contributor,
    )]
    pub contributor_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
