import * as anchor from '@coral-xyz/anchor';
import {
  setupTestEnvironment,
  TestContext,
  BOUNTY_AMOUNT,
  CONTRIBUTOR_GITHUB_ID,
  generateBountyId,
  getBountyPda,
  createBounty,
  assignContributor,
  completeBounty,
  cancelBounty,
  expectAccountClosedError,
  expectAccountNotFoundError,
  getAccount,
  createAssociatedTokenAccount,
  expect
} from './setup';

describe("Complex Workflow Scenarios", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestEnvironment();
  });

  it("should handle workflow: initialize → assign → cancel → try to complete", async () => {
    const bountyId = generateBountyId(90000);
    const bountyPda = getBountyPda(ctx.program, bountyId);

    const maintainerBalanceBefore = await getAccount(ctx.connection, ctx.maintainerTokenAccount);

    // 1. Initialize bounty
    await createBounty(ctx, bountyId);

    // 2. Assign contributor
    await assignContributor(ctx, bountyId);

    // 3. Cancel bounty
    await cancelBounty(ctx, bountyId);

    // Verify tokens returned to maintainer
    const maintainerBalanceAfter = await getAccount(ctx.connection, ctx.maintainerTokenAccount);
    expect(
      maintainerBalanceAfter.amount - maintainerBalanceBefore.amount
    ).to.equal(BigInt(0)); // Net change should be 0 (deposited then withdrawn)

    // 4. Try to complete canceled bounty - should fail
    try {
      await completeBounty(ctx, bountyId);
      expect.fail("Should have failed - bounty was canceled");
    } catch (err) {
      expectAccountClosedError(err);
    }

    // Verify bounty account is closed
    try {
      await ctx.program.account.bounty.fetch(bountyPda);
      expect.fail("Bounty account should be closed");
    } catch (err) {
      expectAccountNotFoundError(err);
    }
  });

  it("should handle workflow: initialize → cancel → try to assign", async () => {
    const bountyId = generateBountyId(95000);
    const bountyPda = getBountyPda(ctx.program, bountyId);

    const maintainerBalanceBefore = await getAccount(ctx.connection, ctx.maintainerTokenAccount);

    // 1. Initialize bounty
    await createBounty(ctx, bountyId);

    // Verify bounty is in Created state
    const bountyAccountBefore = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccountBefore.state).to.deep.equal({ created: {} });

    // 2. Cancel bounty immediately
    await cancelBounty(ctx, bountyId);

    // Verify tokens returned to maintainer
    const maintainerBalanceAfter = await getAccount(ctx.connection, ctx.maintainerTokenAccount);
    expect(
      maintainerBalanceAfter.amount - maintainerBalanceBefore.amount
    ).to.equal(BigInt(0)); // Net change should be 0 (deposited then withdrawn)

    // 3. Try to assign contributor to canceled bounty - should fail
    try {
      await assignContributor(ctx, bountyId);
      expect.fail("Should have failed - bounty was canceled");
    } catch (err) {
      expectAccountClosedError(err);
    }

    // Verify bounty account is closed
    try {
      await ctx.program.account.bounty.fetch(bountyPda);
      expect.fail("Bounty account should be closed");
    } catch (err) {
      expectAccountNotFoundError(err);
    }
  });

  it("should handle workflow: initialize → complete → try to assign → try to cancel", async () => {
    const bountyId = generateBountyId(96000);
    const bountyPda = getBountyPda(ctx.program, bountyId);

    const contributorBalanceBefore = await getAccount(ctx.connection, ctx.contributorTokenAccount);

    // 1. Initialize bounty
    await createBounty(ctx, bountyId);

    // 2. Assign contributor
    await assignContributor(ctx, bountyId);

    // 3. Complete bounty
    await completeBounty(ctx, bountyId);

    // Verify contributor received tokens
    const contributorBalanceAfter = await getAccount(ctx.connection, ctx.contributorTokenAccount);
    expect(
      contributorBalanceAfter.amount - contributorBalanceBefore.amount
    ).to.equal(BigInt(BOUNTY_AMOUNT));

    const anotherContributor = anchor.web3.Keypair.generate();

    // 4. Try to assign new contributor to completed bounty - should fail
    try {
      await assignContributor(ctx, bountyId, anotherContributor.publicKey, 999);
      expect.fail("Should have failed - bounty was completed");
    } catch (err) {
      expectAccountClosedError(err);
    }

    // 5. Try to cancel completed bounty - should fail
    try {
      await cancelBounty(ctx, bountyId);
      expect.fail("Should have failed - bounty was completed");
    } catch (err) {
      expectAccountClosedError(err);
    }

    // Verify bounty account is closed
    try {
      await ctx.program.account.bounty.fetch(bountyPda);
      expect.fail("Bounty account should be closed");
    } catch (err) {
      expectAccountNotFoundError(err);
    }
  });

  it("should handle multiple assign attempts with state validation", async () => {
    const bountyId = generateBountyId(97000);
    const bountyPda = getBountyPda(ctx.program, bountyId);

    // 1. Initialize bounty
    await createBounty(ctx, bountyId);

    // Verify initial state
    let bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.state).to.deep.equal({ created: {} });
    expect(bountyAccount.contributor).to.be.null;

    // 2. Assign first contributor
    await assignContributor(ctx, bountyId);

    // Verify state change
    bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.state).to.deep.equal({ inProgress: {} });
    expect(bountyAccount.contributor.toString()).to.equal(ctx.contributor.publicKey.toString());

    const anotherContributor = anchor.web3.Keypair.generate();

    // 3. Try to assign different contributor - should fail due to state
    try {
      await assignContributor(ctx, bountyId, anotherContributor.publicKey, 888);
      expect.fail("Should have failed - bounty already in progress");
    } catch (err) {
      expect(err.error.errorMessage).to.include("Invalid bounty state");
    }

    // Verify state hasn't changed
    bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.state).to.deep.equal({ inProgress: {} });
    expect(bountyAccount.contributor.toString()).to.equal(ctx.contributor.publicKey.toString());
    expect(bountyAccount.contributorGithubId.toNumber()).to.equal(CONTRIBUTOR_GITHUB_ID);
  });

  it("should handle concurrent bounty operations", async () => {
    // Create multiple bounties simultaneously
    const bountyIds = [
      generateBountyId(98000),
      generateBountyId(98001), 
      generateBountyId(98002)
    ];

    // Initialize all bounties
    await Promise.all(
      bountyIds.map(id => createBounty(ctx, id))
    );

    // Assign contributors to all bounties
    await Promise.all(
      bountyIds.map(id => assignContributor(ctx, id))
    );

    // Complete first, cancel second, leave third in progress
    await completeBounty(ctx, bountyIds[0]);
    await cancelBounty(ctx, bountyIds[1]);
    
    // Verify states
    try {
      await ctx.program.account.bounty.fetch(getBountyPda(ctx.program, bountyIds[0]));
      expect.fail("First bounty should be completed (closed)");
    } catch (err) {
      expectAccountNotFoundError(err);
    }

    try {
      await ctx.program.account.bounty.fetch(getBountyPda(ctx.program, bountyIds[1]));
      expect.fail("Second bounty should be canceled (closed)");
    } catch (err) {
      expectAccountNotFoundError(err);
    }

    const thirdBountyAccount = await ctx.program.account.bounty.fetch(
      getBountyPda(ctx.program, bountyIds[2])
    );
    expect(thirdBountyAccount.state).to.deep.equal({ inProgress: {} });
  });

  it("should handle rapid state transitions", async () => {
    const bountyId = generateBountyId(99000);
    const bountyPda = getBountyPda(ctx.program, bountyId);

    // Rapid sequence: create → assign → complete
    await createBounty(ctx, bountyId);
    
    let bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.state).to.deep.equal({ created: {} });

    await assignContributor(ctx, bountyId);
    
    bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
    expect(bountyAccount.state).to.deep.equal({ inProgress: {} });

    await completeBounty(ctx, bountyId);

    // Verify completion (account closed)
    try {
      await ctx.program.account.bounty.fetch(bountyPda);
      expect.fail("Bounty should be completed (closed)");
    } catch (err) {
      expectAccountNotFoundError(err);
    }
  });

  it("should handle edge case: assign same contributor multiple times to different bounties", async () => {
    const bountyIds = [
      generateBountyId(99100),
      generateBountyId(99101)
    ];

    // Create multiple bounties
    await Promise.all(
      bountyIds.map(id => createBounty(ctx, id))
    );

    // Assign same contributor to multiple bounties (should work)
    await Promise.all(
      bountyIds.map(id => assignContributor(ctx, id))
    );

    // Verify both assignments
    for (const bountyId of bountyIds) {
      const bountyPda = getBountyPda(ctx.program, bountyId);
      const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.contributor.toString()).to.equal(ctx.contributor.publicKey.toString());
      expect(bountyAccount.state).to.deep.equal({ inProgress: {} });
    }

    // Complete one, cancel the other
    await completeBounty(ctx, bountyIds[0]);
    await cancelBounty(ctx, bountyIds[1]);
  });

  it("should handle workflow with different contributors", async () => {
    const bountyId1 = generateBountyId(99200);
    const bountyId2 = generateBountyId(99201);

    // Create second contributor
    const contributor2 = anchor.web3.Keypair.generate();
    await ctx.connection.confirmTransaction(
      await ctx.connection.requestAirdrop(contributor2.publicKey, anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create token account for second contributor
    const contributor2TokenAccount = await createAssociatedTokenAccount(
      ctx.connection,
      ctx.wallet.payer,
      ctx.mint,
      contributor2.publicKey
    );

    // Create bounties
    await createBounty(ctx, bountyId1);
    await createBounty(ctx, bountyId2);

    // Assign different contributors
    await assignContributor(ctx, bountyId1, ctx.contributor.publicKey, CONTRIBUTOR_GITHUB_ID);
    await assignContributor(ctx, bountyId2, contributor2.publicKey, 999);

    // Verify different contributors
    const bounty1Account = await ctx.program.account.bounty.fetch(getBountyPda(ctx.program, bountyId1));
    const bounty2Account = await ctx.program.account.bounty.fetch(getBountyPda(ctx.program, bountyId2));

    expect(bounty1Account.contributor.toString()).to.equal(ctx.contributor.publicKey.toString());
    expect(bounty2Account.contributor.toString()).to.equal(contributor2.publicKey.toString());
    expect(bounty1Account.contributorGithubId.toNumber()).to.equal(CONTRIBUTOR_GITHUB_ID);
    expect(bounty2Account.contributorGithubId.toNumber()).to.equal(999);

    // Complete both with correct contributors
    await completeBounty(ctx, bountyId1, ctx.contributor.publicKey);
    await completeBounty(ctx, bountyId2, contributor2.publicKey);
  });
}); 