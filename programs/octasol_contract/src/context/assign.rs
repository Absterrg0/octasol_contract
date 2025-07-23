use anchor_lang::prelude::*;
use crate::state::Bounty;

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct AssignContributor<'info> {
    #[account(
        mut,
        has_one = maintainer,
        seeds = [b"bounty".as_ref(), bounty_id.to_le_bytes().as_ref()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(mut)]
    pub maintainer: Signer<'info>,

    /// CHECK: Contributor address is validated in the instruction
    pub contributor: UncheckedAccount<'info>,
}
