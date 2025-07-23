use anchor_lang::prelude::*;

// Events for comprehensive tracking
#[event]
pub struct BountyCreated {
    pub bounty_id: u64,
    pub maintainer: Pubkey,
    pub amount: u64,
    pub github_issue_id: u64,
}

#[event]
pub struct ContributorAssigned {
    pub bounty_id: u64,
    pub contributor: Pubkey,
    pub contributor_github_id: u64,
}

#[event]
pub struct BountyCompleted {
    pub bounty_id: u64,
    pub contributor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BountyCancelled {
    pub bounty_id: u64,
    pub reason: String,
}
