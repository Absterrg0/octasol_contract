use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount, Token};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::Bounty;

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct InitializeBounty<'info> {
    #[account(
        init,
        payer = maintainer,
        space = Bounty::LEN,
        seeds = [b"bounty".as_ref(), bounty_id.to_le_bytes().as_ref()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(mut)]
    pub maintainer: Signer<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = maintainer,
    )]
    pub maintainer_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = maintainer,
        associated_token::mint = mint,
        associated_token::authority = bounty,
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}
