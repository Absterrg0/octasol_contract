use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

mod state;
mod context;
use context::*;
use state::*;
mod util;
use util::{errors::BountyError, events::*};



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
        // Enhanced Validation
        require!(amount > 0, BountyError::ZeroAmount);
        
        // Economic controls - minimum bounty amount (1000 tokens minimum)
        const MIN_BOUNTY_AMOUNT: u64 = 1000;
        require!(amount >= MIN_BOUNTY_AMOUNT, BountyError::InsufficientAmount);
        
        let clock = Clock::get()?;
        
        let bounty = &mut ctx.accounts.bounty;
        bounty.maintainer = ctx.accounts.maintainer.key();
        bounty.amount = amount;
        bounty.github_issue_id = github_issue_id;
        bounty.maintainer_github_id = maintainer_github_id;
        bounty.state = BountyState::Created;
        bounty.bounty_id = bounty_id;
        bounty.created_at = clock.unix_timestamp;

        let transfer_instruction = Transfer {
            from: ctx.accounts.maintainer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.maintainer.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_instruction,
            ),
            amount,
        )?;

        // Emit event
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
        contributor_github_id: u64,
    ) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        require!(
            bounty.state == BountyState::Created,
            BountyError::InvalidBountyState
        );

        // Prevent assigning if already has a contributor
        require!(
            bounty.contributor.is_none(),
            BountyError::ContributorAlreadyAssigned
        );

        bounty.contributor = Some(ctx.accounts.contributor.key());
        bounty.contributor_github_id = Some(contributor_github_id);
        bounty.state = BountyState::InProgress;

        // Emit event
        emit!(ContributorAssigned {
            bounty_id: bounty.bounty_id,
            contributor: ctx.accounts.contributor.key(),
            contributor_github_id,
        });

        Ok(())
    }

    // Maintainer completes bounty and pays contributor
    pub fn complete_bounty(ctx: Context<CompleteBounty>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        require!(
            bounty.state == BountyState::InProgress,
            BountyError::InvalidBountyState
        );

        // Transfer tokens from escrow to contributor
        let transfer_instruction = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.contributor_token_account.to_account_info(),
            authority: bounty.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_instruction,
                &[&[
                    b"bounty".as_ref(),
                    bounty.bounty_id.to_le_bytes().as_ref(),
                    &[ctx.bumps.bounty],
                ]],
            ),
            bounty.amount,
        )?;

        bounty.state = BountyState::Completed;

        // Emit event
        emit!(BountyCompleted {
            bounty_id: bounty.bounty_id,
            contributor: ctx.accounts.contributor.key(),
            amount: bounty.amount,
        });

        Ok(())
    }

    pub fn cancel_bounty(ctx: Context<CancelBounty>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        
        // Only allow cancellation in Created or InProgress state
        require!(
            bounty.state == BountyState::Created || 
            bounty.state == BountyState::InProgress,
            BountyError::InvalidBountyState
        );

        // Transfer tokens back to maintainer
        let transfer_instruction = Transfer {
            from: ctx.accounts.escrow_token_account.to_account_info(),
            to: ctx.accounts.maintainer_token_account.to_account_info(),
            authority: bounty.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_instruction,
                &[&[
                    b"bounty".as_ref(),
                    bounty.bounty_id.to_le_bytes().as_ref(),
                    &[ctx.bumps.bounty],
                ]],
            ),
            bounty.amount,
        )?;

        bounty.state = BountyState::Cancelled;

        // Emit event
        let reason = if bounty.contributor.is_none() {
            "No contributor assigned".to_string()
        } else {
            "Cancelled by maintainer".to_string()
        };
        
        emit!(BountyCancelled {
            bounty_id: bounty.bounty_id,
            reason,
        });

        Ok(())
    }
}

