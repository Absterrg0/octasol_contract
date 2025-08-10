use anchor_lang::prelude::*;
use crate::Bounty;



#[derive(Accounts)]
pub struct AssignContributor<'info> {
    #[account(mut)]
    pub maintainer: Signer<'info>,

    #[account(
        mut,
        // This constraint fixes the security flaw from before
        has_one = maintainer,
        // This constraint prevents re-assignment
        constraint = bounty.contributor.is_none()
    )]
    pub bounty: Account<'info, Bounty>, 

    /// CHECK: We are only using this account to get its public key.
    pub contributor: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}