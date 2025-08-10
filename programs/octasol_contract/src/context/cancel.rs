use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount}};

use crate::state::Bounty;



#[derive(Accounts)]
pub struct CancelBounty<'info>{
    #[account(mut)]
    pub maintainer:Signer<'info>,
    #[account(
        mut,
        has_one=maintainer,
        close=maintainer
    )]
    pub bounty: Account<'info,Bounty>,
    #[account(
        mut,
        seeds=[b"escrow_auth",bounty.key().as_ref()],
        bump=bounty.bump
    )]
    ///CHECK: Account for transferring funds from escrow to maintainer
    pub escrow_authority:UncheckedAccount<'info>,
    #[account(mut)]
    pub maintainer_token_account:Account<'info,TokenAccount>,
    #[account(mut)]
    pub escrow_token_account:Account<'info,TokenAccount>,
    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent:Sysvar<'info,Rent>
    
    
}