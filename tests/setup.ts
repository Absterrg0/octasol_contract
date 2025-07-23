import * as anchor from '@coral-xyz/anchor';
import { Program } from "@coral-xyz/anchor";
import { OctasolContract } from "../target/types/octasol_contract";
import { 
  createMint, 
  createAssociatedTokenAccount, 
  mintTo, 
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { expect } from 'chai';

// Test constants
export const BOUNTY_AMOUNT = 5000; // Above minimum of 1000
export const GITHUB_ISSUE_ID = 123;
export const MAINTAINER_GITHUB_ID = 456;
export const CONTRIBUTOR_GITHUB_ID = 789;

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
  const maintainerTokenAccount = await createAssociatedTokenAccount(
    connection,
    wallet.payer,
    mint,
    maintainer.publicKey
  );

  const contributorTokenAccount = await createAssociatedTokenAccount(
    connection,
    wallet.payer,
    mint,
    contributor.publicKey
  );

  // Mint tokens to maintainer
  await mintTo(
    connection,
    wallet.payer,
    mint,
    maintainerTokenAccount,
    wallet.payer,
    100000 // 100k tokens
  );

  return {
    provider,
    program,
    connection,
    wallet,
    maintainer,
    contributor,
    mint,
    maintainerTokenAccount,
    contributorTokenAccount
  };
}

// Utility functions
export function generateBountyId(offset: number = 0): number {
  return Math.floor(Math.random() * 1000000) + offset;
}

export function getBountyPda(program: Program<OctasolContract>, bountyId: number): anchor.web3.PublicKey {
  const [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  return bountyPda;
}

export async function createBounty(
  ctx: TestContext, 
  bountyId: number, 
  amount: number = BOUNTY_AMOUNT
): Promise<void> {
  await ctx.program.methods
    .initializeBounty(
      new anchor.BN(bountyId),
      new anchor.BN(amount),
      new anchor.BN(GITHUB_ISSUE_ID),
      new anchor.BN(MAINTAINER_GITHUB_ID)
    )
    .accountsPartial({
      maintainer: ctx.maintainer.publicKey,
      mint: ctx.mint,
    })
    .signers([ctx.maintainer])
    .rpc();
}

export async function assignContributor(
  ctx: TestContext,
  bountyId: number,
  contributorKey: anchor.web3.PublicKey = ctx.contributor.publicKey,
  contributorGithubId: number = CONTRIBUTOR_GITHUB_ID
): Promise<void> {
  await ctx.program.methods
    .assignContributor(
      new anchor.BN(bountyId),
      new anchor.BN(contributorGithubId)
    )
    .accountsPartial({
      maintainer: ctx.maintainer.publicKey,
      contributor: contributorKey,
    })
    .signers([ctx.maintainer])
    .rpc();
}

export async function completeBounty(
  ctx: TestContext,
  bountyId: number,
  contributorKey: anchor.web3.PublicKey = ctx.contributor.publicKey
): Promise<void> {
  await ctx.program.methods
    .completeBounty(new anchor.BN(bountyId))
    .accountsPartial({
      maintainer: ctx.maintainer.publicKey,
      contributor: contributorKey,
      mint: ctx.mint,
    })
    .signers([ctx.maintainer])
    .rpc();
}

export async function cancelBounty(
  ctx: TestContext,
  bountyId: number
): Promise<void> {
  await ctx.program.methods
    .cancelBounty(new anchor.BN(bountyId))
    .accountsPartial({
      maintainer: ctx.maintainer.publicKey,
      mint: ctx.mint,
    })
    .signers([ctx.maintainer])
    .rpc();
}

// Error expectation helpers
export function expectConstraintError(err: any): void {
  if (err.logs) {
    expect(
      err.logs.some(log => log.includes("ConstraintHasOne")) ||
      err.logs.some(log => log.includes("Error"))
    ).to.be.true;
  } else if (err.error && err.error.errorCode) {
    expect(err.error.errorCode.code).to.equal("ConstraintHasOne");
  } else {
    expect(err).to.exist;
  }
}

export function expectAccountClosedError(err: any): void {
  expect(err.message).to.include("AnchorError");
}

export function expectAccountNotFoundError(err: any): void {
  expect(err.message).to.include("Account does not exist");
}

// Re-export common testing utilities
export { expect, getAccount, getAssociatedTokenAddress, createMint, createAssociatedTokenAccount }; 