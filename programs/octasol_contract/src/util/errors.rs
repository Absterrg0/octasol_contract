use anchor_lang::prelude::*;

#[error_code]
pub enum ContractError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Insufficient bounty amount")]
    InsufficientAmount,
    #[msg("Invalid bounty state")]
    InvalidBountyState,
    #[msg("Invalid contributor")]
    InvalidContributor,
}


