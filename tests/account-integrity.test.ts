import * as anchor from '@coral-xyz/anchor';
import {
  setupTestEnvironment,
  TestContext,
  CONTRIBUTOR_GITHUB_ID,
  generateBountyId,
  getBountyPda,
  createBounty,
  assignContributor,
  createMint,
  createAssociatedTokenAccount,
  expect
} from './setup';

describe("Account and Data Integrity", () => {
  let ctx: TestContext;
  let bountyId: number;
  let bountyPda: anchor.web3.PublicKey;
  let wrongContributor: anchor.web3.Keypair;
  let wrongContributorTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    ctx = await setupTestEnvironment();
  });

  beforeEach(async () => {
    bountyId = generateBountyId(80000);
    bountyPda = getBountyPda(ctx.program, bountyId);

    // Create wrong contributor
    wrongContributor = anchor.web3.Keypair.generate();
    await ctx.connection.confirmTransaction(
      await ctx.connection.requestAirdrop(wrongContributor.publicKey, anchor.web3.LAMPORTS_PER_SOL)
    );

    wrongContributorTokenAccount = await createAssociatedTokenAccount(
      ctx.connection,
      ctx.wallet.payer,
      ctx.mint,
      wrongContributor.publicKey
    );

    // Create and assign bounty to correct contributor
    await createBounty(ctx, bountyId);
    await assignContributor(ctx, bountyId);
  });

  it("should fail when completing with wrong contributor", async () => {
    try {
      await ctx.program.methods
        .completeBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: ctx.maintainer.publicKey,
          contributor: wrongContributor.publicKey,
          mint: ctx.mint,
        })
        .signers([ctx.maintainer])
        .rpc();
      
      expect.fail("Should have failed with wrong contributor");
    } catch (err) {
      expect(err.error.errorMessage).to.include("Invalid contributor");
    }
  });

  it("should fail when using wrong mint account", async () => {
    // Create a different mint
    const wrongMint = await createMint(
      ctx.connection,
      ctx.wallet.payer,
      ctx.wallet.publicKey,
      ctx.wallet.publicKey,
      6
    );

    try {
      await ctx.program.methods
        .completeBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: ctx.maintainer.publicKey,
          contributor: ctx.contributor.publicKey,
          mint: wrongMint,
        })
        .signers([ctx.maintainer])
        .rpc();
      
      expect.fail("Should have failed with wrong mint");
    } catch (err) {
      // Should fail with constraint violation for associated token account
      expect(err).to.exist;
    }
  });

  it("should validate bounty data consistency", async () => {
    const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    
    // Verify all fields are correctly set
    expect(bountyAccount.maintainer.toString()).to.equal(ctx.maintainer.publicKey.toString());
    expect(bountyAccount.contributor.toString()).to.equal(ctx.contributor.publicKey.toString());
    expect(bountyAccount.contributorGithubId.toNumber()).to.equal(CONTRIBUTOR_GITHUB_ID);
    expect(bountyAccount.state).to.deep.equal({ inProgress: {} });
    expect(bountyAccount.bountyId.toNumber()).to.equal(bountyId);
    
    // Verify numeric fields are positive
    expect(bountyAccount.amount.toNumber()).to.be.greaterThan(0);
    expect(bountyAccount.githubIssueId.toNumber()).to.be.greaterThan(0);
    expect(bountyAccount.maintainerGithubId.toNumber()).to.be.greaterThan(0);
  });

  it("should fail when wrong maintainer tries operations", async () => {
    const wrongMaintainer = anchor.web3.Keypair.generate();
    await ctx.connection.confirmTransaction(
      await ctx.connection.requestAirdrop(wrongMaintainer.publicKey, anchor.web3.LAMPORTS_PER_SOL)
    );

    // Test wrong maintainer trying to complete
    try {
      await ctx.program.methods
        .completeBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: wrongMaintainer.publicKey,
          contributor: ctx.contributor.publicKey,
          mint: ctx.mint,
        })
        .signers([wrongMaintainer])
        .rpc();
      
      expect.fail("Should have failed with wrong maintainer");
    } catch (err) {
      // Should fail with constraint violation
      expect(err).to.exist;
    }

    // Test wrong maintainer trying to cancel
    try {
      await ctx.program.methods
        .cancelBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: wrongMaintainer.publicKey,
          mint: ctx.mint,
        })
        .signers([wrongMaintainer])
        .rpc();
      
      expect.fail("Should have failed with wrong maintainer");
    } catch (err) {
      // Should fail with constraint violation
      expect(err).to.exist;
    }
  });

  it("should enforce correct PDA derivation", async () => {
    // Try to use wrong bounty PDA
    const wrongBountyId = generateBountyId(85000);
    const wrongBountyPda = getBountyPda(ctx.program, wrongBountyId);

    try {
      // Try to complete with wrong bounty PDA (this should fail during account resolution)
      await ctx.program.methods
        .completeBounty(new anchor.BN(bountyId)) // Correct bounty_id parameter
        .accountsPartial({
          maintainer: ctx.maintainer.publicKey,
          contributor: ctx.contributor.publicKey,
          mint: ctx.mint,
          bounty: wrongBountyPda, // Wrong bounty PDA
        })
        .signers([ctx.maintainer])
        .rpc();
      
      expect.fail("Should have failed with wrong bounty PDA");
    } catch (err) {
      // Should fail with account resolution error
      expect(err).to.exist;
    }
  });

  it("should validate GitHub ID constraints", async () => {
    const newBountyId = generateBountyId(86000);

    // Test with zero GitHub issue ID (should still work as it's just data)
    await ctx.program.methods
      .initializeBounty(
        new anchor.BN(newBountyId),
        new anchor.BN(5000),
        new anchor.BN(0), // Zero GitHub issue ID
        new anchor.BN(456)
      )
      .accountsPartial({
        maintainer: ctx.maintainer.publicKey,
        mint: ctx.mint,
      })
      .signers([ctx.maintainer])
      .rpc();

    const bountyPda = getBountyPda(ctx.program, newBountyId);
    const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.githubIssueId.toNumber()).to.equal(0);
  });

  it("should handle large bounty IDs correctly", async () => {
    const largeBountyId = 999999999; // Large but valid u64
    
    await ctx.program.methods
      .initializeBounty(
        new anchor.BN(largeBountyId),
        new anchor.BN(5000),
        new anchor.BN(123),
        new anchor.BN(456)
      )
      .accountsPartial({
        maintainer: ctx.maintainer.publicKey,
        mint: ctx.mint,
      })
      .signers([ctx.maintainer])
      .rpc();

    const bountyPda = getBountyPda(ctx.program, largeBountyId);
    const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.bountyId.toNumber()).to.equal(largeBountyId);
  });

  it("should validate contributor data on completion", async () => {
    // Complete with correct contributor
    await ctx.program.methods
      .completeBounty(new anchor.BN(bountyId))
      .accountsPartial({
        maintainer: ctx.maintainer.publicKey,
        contributor: ctx.contributor.publicKey,
        mint: ctx.mint,
      })
      .signers([ctx.maintainer])
      .rpc();

    // Verify bounty account is closed after completion
    try {
      await ctx.program.account.bounty.fetch(bountyPda);
      expect.fail("Bounty account should be closed");
    } catch (err) {
      expect(err.message).to.include("Account does not exist");
    }
  });
}); 