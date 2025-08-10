use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{ Token, TokenAccount}};
use crate::state::Bounty;

#[derive(Accounts)]

pub struct CompleteBounty<'info> {
    #[account(
        mut,
        constraint = bounty.contributor.is_some(),
        has_one=keeper,
        close = maintainer
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        seeds=[b"escrow_auth",bounty.key().as_ref()],
        bump = bounty.bump
    )]
    /// CHECK:PDA SIGNER
    pub escrow_authority: UncheckedAccount<'info>,

    /// CHECK: Maintainer account for rent collection
    #[account(mut)]
    pub maintainer: AccountInfo<'info>,


    /// CHECK: Contributor is validated by bounty.contributor field 
    #[account(mut)]
    pub contributor: UncheckedAccount<'info>,

    #[account(
        mut,

    )]
    pub keeper: Signer<'info>,

    #[account(
        mut
    )]
    pub contributor_token_account:Account<'info,TokenAccount>,
    #[account(
        mut
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info,System>,
    pub associated_token_program: Program<'info,AssociatedToken>
}
