use anchor_lang::prelude::*;

#[error_code]
pub enum BountyError {
    #[msg("Invalid bounty state for this operation")]
    InvalidBountyState,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Only maintainer can perform this operation")]
    UnauthorizedOperation,
    #[msg("Insufficient bounty amount - minimum 1000 tokens required")]
    InsufficientAmount,
    #[msg("Bounty already has a contributor assigned")]
    ContributorAlreadyAssigned,
    #[msg("Overflow in arithmetic operation")]
    ArithmeticOverflow,
}


