use anchor_lang::prelude::*;
use anchor_spl::token::{transfer,Transfer};


pub mod context;
pub mod state;
pub mod util;

use context::*;
use state::*;
use util::{errors::ContractError, events::*};


declare_id!("5y7GK42mAZm1C6qpFgUgGdNVLPkdd3wJhF9AkyRcDrUv");




#[program]
pub mod octasol_contract {

    use super::*;

    pub fn initialize_bounty(
        ctx: Context<InitializeBounty>,
        bounty_id: u64,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ContractError::InvalidAmount);

        let bounty = &mut ctx.accounts.bounty;
        bounty.maintainer = ctx.accounts.maintainer.key();
        bounty.contributor = None;
        bounty.mint = ctx.accounts.mint.key();
        bounty.amount = amount;
        bounty.bump = ctx.bumps.escrow_authority;
        bounty.keeper = ctx.accounts.keeper.key();
        bounty.bounty_id = bounty_id;
        bounty.state = BountyState::Created;

        // Transfer tokens from maintainer to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.maintainer_token_account.to_account_info(),
            to: ctx.accounts.escrow_token_account.to_account_info(),
            authority: ctx.accounts.maintainer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        let _ =transfer(cpi_ctx, amount)?;

        emit!(BountyCreated {
            bounty_id,
            maintainer: ctx.accounts.maintainer.key(),
            amount,
        });

        Ok(())
    }

pub fn assign_contributor(ctx: Context<AssignContributor>) -> Result<()> {
    let bounty = &mut ctx.accounts.bounty;

    let contributor_key = ctx.accounts.contributor.key();

    bounty.contributor = Some(contributor_key);

    bounty.state = BountyState::InProgress;

    Ok(())
}


    // Maintainer completes bounty and pays contributor
    pub fn complete_bounty(ctx: Context<CompleteBounty>,bounty_id:u64) -> Result<()> {
      
        let bounty = &mut ctx.accounts.bounty;
        let bounty_key = bounty.key();
        let bump = bounty.bump;
        let seeds = &[b"escrow_auth",bounty_key.as_ref(),&[bump]];
        let binding = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer{
            from:ctx.accounts.escrow_token_account.to_account_info(),
            to:ctx.accounts.contributor_token_account.to_account_info(),
            authority:ctx.accounts.escrow_authority.to_account_info(),
        }, binding);

        let _ = transfer(cpi_ctx, bounty.amount)?;
        emit!(BountyCompleted {
            bounty_id,
            contributor: ctx.accounts.contributor.key(),
            amount: bounty.amount,
        });
        
        bounty.state = BountyState::Completed;
        Ok(())
    }

    pub fn cancel_bounty(ctx:Context<CancelBounty>) -> Result<()> {
        let bounty = &mut ctx.accounts.bounty;
        let bounty_key = bounty.key();
        let bump = bounty.bump;
        let seeds = &[b"escrow_auth",bounty_key.as_ref(),&[bump]];
        let binding = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer{
            from:ctx.accounts.escrow_token_account.to_account_info(),
            to:ctx.accounts.maintainer_token_account.to_account_info(),
            authority:ctx.accounts.escrow_authority.to_account_info(),
        }, binding);

        let _ = transfer(cpi_ctx, bounty.amount)?;

        emit!(BountyCancelled {
            bounty_id:bounty.bounty_id,
            maintainer:ctx.accounts.maintainer.key(),
            amount:bounty.amount,
        });
        
        bounty.state = BountyState::Cancelled;
        
        Ok(())
    }
        



}