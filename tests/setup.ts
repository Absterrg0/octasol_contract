import * as anchor from '@coral-xyz/anchor';
import { Program } from "@coral-xyz/anchor";
import { OctasolContract } from '../target/types/octasol_contract';
import { 
  createMint, 
  createAssociatedTokenAccount, 
  mintTo, 
  getAccount,
  getAssociatedTokenAddress,
  createAccount,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { expect } from 'chai';

// Test constants
export const BOUNTY_AMOUNT =new anchor.BN(5000) ; // Above minimum of 1000

// Global test state
export interface TestContext {
  provider: anchor.AnchorProvider;
  program: Program<OctasolContract>;
  connection: anchor.web3.Connection;
  wallet: anchor.Wallet;
  maintainer: anchor.web3.Keypair;
  contributor: anchor.web3.Keypair;
  mint: anchor.web3.PublicKey;
  maintainerTokenAccount: anchor.web3.PublicKey;
  contributorTokenAccount: anchor.web3.PublicKey;
  escrowAuthority:anchor.web3.PublicKey;
  escrowKeyPair:anchor.web3.Keypair;
  bounty:anchor.web3.PublicKey;
  keeperKeyPair:anchor.web3.Keypair;
}

export async function setupTestEnvironment(): Promise<TestContext> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OctasolContract as Program<OctasolContract>;
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;

  // Generate keypairs
  const maintainer = anchor.web3.Keypair.generate();
  const contributor = anchor.web3.Keypair.generate();

  // Airdrop SOL to maintainer and contributor
  await connection.confirmTransaction(
    await connection.requestAirdrop(maintainer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
  );
  await connection.confirmTransaction(
    await connection.requestAirdrop(contributor.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
  );

  // Create mint
  const mint = await createMint(
    connection,
    wallet.payer,
    wallet.publicKey,
    wallet.publicKey,
    6 // 6 decimals
  );

  // Create token accounts
  const maintainerTokenAccount = await createAccount(connection,wallet.payer,mint,provider.publicKey);


    // Mint tokens to maintainer
  await mintTo(
    connection,
    wallet.payer,
    mint,
    maintainerTokenAccount,
    wallet.payer,
    100000 // 100k tokens
  );
  const contributorAccount = await provider.sendAndConfirm(
    new anchor.web3.Transaction().add(
      SystemProgram.createAccount({
        fromPubkey:provider.publicKey,
        newAccountPubkey:provider.publicKey,
        space:0,
        lamports:await provider.connection.getMinimumBalanceForRentExemption(0),
        programId:SystemProgram.programId
      })
    ),[contributor]
  )

  const contributorTokenAccount = await createAccount(connection,wallet.payer,mint,contributor.publicKey);

  let keeperKeyPair = anchor.web3.Keypair.generate();
  const escrowKeyPair = anchor.web3.Keypair.generate();

  const escrowAuthority= getBountyPda(program,escrowKeyPair);

  const bounty = await anchor.utils.token.associatedAddress({
    mint:mint,
    owner:escrowAuthority
  }
  )
  




  return {
    provider,
    program,
    connection,
    wallet,
    maintainer,
    contributor,
    mint,
    maintainerTokenAccount,
    contributorTokenAccount,
    escrowAuthority,
    escrowKeyPair,
    bounty,
    keeperKeyPair,
  };
}

// Utility functions
export function generateBountyId(offset: number = 0): number {
  return Math.floor(Math.random() * 1000000) + offset;
}

export function getBountyPda(program: Program<OctasolContract>, escrow:Keypair): anchor.web3.PublicKey {
  const [bountyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_auth"), escrow.publicKey.toBuffer()],
    program.programId
  );
  return bountyPda;
}

