use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

pub mod context;
pub mod state;
pub mod util;

use context::*;
use state::*;
use util::{errors::ContractError, events::*};


declare_id!("tMf5EmV2h6sMJ2QMFU6766ACJpf7NTuamPzCudaNFus");




#[program]
pub mod octasol_contract {
    use super::*;

    pub fn initialize_bounty(
        ctx: Context<InitializeBounty>,
        bounty_id: u64,
        amount: u64,
        github_issue_id: u64,
        maintainer_github_id: u64,
    ) -> Result<()> {
        require!(amount > 0, ContractError::InvalidAmount);
        require!(amount >= 1000, ContractError::InsufficientAmount);

        let bounty = &mut ctx.accounts.bounty;
        bounty.bounty_id = bounty_id;
        bounty.maintainer = ctx.accounts.maintainer.key();
        bounty.amount = amount;
        bounty.github_issue_id = github_issue_id;
        bounty.maintainer_github_id = maintainer_github_id;
        bounty.state = BountyState::Created;
        bounty.contributor = None;
        bounty.contributor_github_id = None;

        // Transfer tokens from maintainer to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.maintainer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.maintainer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(BountyCreated {
            bounty_id,
            maintainer: ctx.accounts.maintainer.key(),
            amount,
            github_issue_id,
        });

        Ok(())
    }

    // Maintainer assigns contributor
    pub fn assign_contributor(
        ctx: Context<AssignContributor>,
        bounty_id: u64,
        contributor_github_id: u64,
    ) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        
        require!(
            matches!(bounty.state, BountyState::Created),
            ContractError::InvalidBountyState
        );

        bounty.contributor = Some(ctx.accounts.contributor.key());
        bounty.contributor_github_id = Some(contributor_github_id);
        bounty.state = BountyState::InProgress;

        emit!(ContributorAssigned {
            bounty_id,
            contributor: ctx.accounts.contributor.key(),
            contributor_github_id,
        });

        Ok(())
    }

    // Maintainer completes bounty and pays contributor
    pub fn complete_bounty(ctx: Context<CompleteBounty>, bounty_id: u64) -> Result<()> {
        let bounty = &ctx.accounts.bounty;
        
        require!(
            matches!(bounty.state, BountyState::InProgress),
            ContractError::InvalidBountyState
        );

        require!(
            bounty.contributor == Some(ctx.accounts.contributor.key()),
            ContractError::InvalidContributor
        );

        // Transfer tokens from escrow to contributor
        let seeds = &[
            b"bounty".as_ref(),
            &bounty.bounty_id.to_le_bytes(),
            &[ctx.bumps.bounty],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.contributor_token_account.to_account_info(),
            authority: ctx.accounts.bounty.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, bounty.amount)?;

        emit!(BountyCompleted {
            bounty_id,
            contributor: ctx.accounts.contributor.key(),
            amount: bounty.amount,
        });

        Ok(())
    }

    pub fn cancel_bounty(ctx: Context<CancelBounty>, bounty_id: u64) -> Result<()> {
        let bounty = &ctx.accounts.bounty;
        
        require!(
            matches!(bounty.state, BountyState::Created | BountyState::InProgress),
            ContractError::InvalidBountyState
        );

        // Transfer tokens back to maintainer
        let seeds = &[
            b"bounty".as_ref(),
            &bounty.bounty_id.to_le_bytes(),
            &[ctx.bumps.bounty],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.maintainer_token_account.to_account_info(),
            authority: ctx.accounts.bounty.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, bounty.amount)?;

        let message = if bounty.state == BountyState::Created {
            "No contributor assigned"
        } else {
            "Cancelled by maintainer"
        };

        emit!(BountyCancelled {
            bounty_id,
            reason: message.to_string(),
        });

        Ok(())
    }
}

