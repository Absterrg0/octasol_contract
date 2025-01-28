use anchor_lang::prelude::*;

declare_id!("tMf5EmV2h6sMJ2QMFU6766ACJpf7NTuamPzCudaNFus");

#[program]
pub mod octasol_contract {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[account]
pub struct Bounty {
    pub maintainer: Pubkey,
    pub contributor: Option<Pubkey>,
    pub amount: u64,
    pub state: BountyState,
    pub bounty_id: u64,
    pub github_issue_id: u64,
    pub maintainer_github_id: u64,
    pub contributor_github_id: Option<u64>,
}

impl Bounty {
    pub const LEN: usize = 8 + // discriminator
        32 + // maintainer pubkey
        33 + // contributor option pubkey
        8 + // amount
        1 + // state
        8 + // bounty_id
        8 + // github_issue_id
        8 + // maintainer_github_id
        9; // contributor_github_id option
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum BountyState {
    Created,
    InProgress,
    Completed,
    Cancelled,
}