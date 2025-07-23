use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount, Token};
use crate::state::Bounty;

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct CancelBounty<'info> {
    #[account(
        mut,
        has_one = maintainer,
        close = maintainer,  // Rent-exempt SOL goes back to maintainer on cancellation
        seeds = [b"bounty", bounty_id.to_le_bytes().as_ref()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(mut)]
    pub maintainer: Signer<'info>,

    #[account()]
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
        associated_token::authority = maintainer,
    )]
    pub maintainer_token_account: Account<'info, TokenAccount>,

    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
}
