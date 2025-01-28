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
