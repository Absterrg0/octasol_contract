import * as anchor from '@coral-xyz/anchor';
import {
  setupTestEnvironment,
  TestContext,
  CONTRIBUTOR_GITHUB_ID,
  generateBountyId,
  getBountyPda,
  createBounty,
  assignContributor,
  completeBounty,
  cancelBounty,
  expectAccountClosedError,
  expect
} from './setup';

describe("State Machine Integrity", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestEnvironment();
  });

  describe("Invalid state transitions", () => {
    it("should fail to cancel already canceled bounty", async () => {
      const bountyId = generateBountyId(70000);
      
      await createBounty(ctx, bountyId);
      
      // Cancel bounty first time
      await cancelBounty(ctx, bountyId);

      // Try to cancel again - should fail because account is closed
      try {
        await cancelBounty(ctx, bountyId);
        expect.fail("Should have failed - bounty already canceled");
      } catch (err) {
        expectAccountClosedError(err);
      }
    });

    it("should fail to complete canceled bounty", async () => {
      const bountyId = generateBountyId(71000);
      
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId);
      
      // Cancel bounty
      await cancelBounty(ctx, bountyId);

      // Try to complete canceled bounty - should fail because account is closed
      try {
        await completeBounty(ctx, bountyId);
        expect.fail("Should have failed - bounty was canceled");
      } catch (err) {
        expectAccountClosedError(err);
      }
    });

    it("should fail to assign contributor to canceled bounty", async () => {
      const bountyId = generateBountyId(72000);
      
      await createBounty(ctx, bountyId);
      
      // Cancel bounty
      await cancelBounty(ctx, bountyId);

      // Try to assign contributor to canceled bounty
      try {
        await assignContributor(ctx, bountyId);
        expect.fail("Should have failed - bounty was canceled");
      } catch (err) {
        expectAccountClosedError(err);
      }
    });

    it("should fail to assign contributor to completed bounty", async () => {
      const bountyId = generateBountyId(73000);
      
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId);
      await completeBounty(ctx, bountyId);

      const anotherContributor = anchor.web3.Keypair.generate();

      // Try to assign new contributor to completed bounty
      try {
        await assignContributor(ctx, bountyId, anotherContributor.publicKey, 999);
        expect.fail("Should have failed - bounty was completed");
      } catch (err) {
        expectAccountClosedError(err);
      }
    });

    it("should fail to complete bounty twice", async () => {
      const bountyId = generateBountyId(74000);
      
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId);
      await completeBounty(ctx, bountyId);

      // Try to complete again - should fail because account is closed
      try {
        await completeBounty(ctx, bountyId);
        expect.fail("Should have failed - bounty already completed");
      } catch (err) {
        expectAccountClosedError(err);
      }
    });

    it("should fail to cancel completed bounty", async () => {
      const bountyId = generateBountyId(75000);
      
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId);
      await completeBounty(ctx, bountyId);

      // Try to cancel completed bounty - should fail because account is closed
      try {
        await cancelBounty(ctx, bountyId);
        expect.fail("Should have failed - bounty was completed");
      } catch (err) {
        expectAccountClosedError(err);
      }
    });
  });

  describe("Valid state transitions", () => {
    it("should validate Created → InProgress transition", async () => {
      const bountyId = generateBountyId(76000);
      const bountyPda = getBountyPda(ctx.program, bountyId);
      
      await createBounty(ctx, bountyId);

      // Verify initial state
      let bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.state).to.deep.equal({ created: {} });
      expect(bountyAccount.contributor).to.be.null;

      // Assign contributor
      await assignContributor(ctx, bountyId);

      // Verify state change
      bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.state).to.deep.equal({ inProgress: {} });
      expect(bountyAccount.contributor.toString()).to.equal(ctx.contributor.publicKey.toString());
    });

    it("should validate InProgress → Completed transition", async () => {
      const bountyId = generateBountyId(77000);
      const bountyPda = getBountyPda(ctx.program, bountyId);
      
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId);

      // Verify InProgress state
      let bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.state).to.deep.equal({ inProgress: {} });

      // Complete bounty
      await completeBounty(ctx, bountyId);

      // Verify bounty account is closed (equivalent to Completed state)
      try {
        await ctx.program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });

    it("should validate Created → Cancelled transition", async () => {
      const bountyId = generateBountyId(78000);
      const bountyPda = getBountyPda(ctx.program, bountyId);
      
      await createBounty(ctx, bountyId);

      // Verify Created state
      let bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.state).to.deep.equal({ created: {} });

      // Cancel bounty
      await cancelBounty(ctx, bountyId);

      // Verify bounty account is closed (equivalent to Cancelled state)
      try {
        await ctx.program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });

    it("should validate InProgress → Cancelled transition", async () => {
      const bountyId = generateBountyId(79000);
      const bountyPda = getBountyPda(ctx.program, bountyId);
      
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId);

      // Verify InProgress state
      let bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.state).to.deep.equal({ inProgress: {} });

      // Cancel bounty
      await cancelBounty(ctx, bountyId);

      // Verify bounty account is closed (equivalent to Cancelled state)
      try {
        await ctx.program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });
  });

  describe("State validation during operations", () => {
    it("should enforce Created state for assign_contributor", async () => {
      const bountyId = generateBountyId(80000);
      
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId); // Changes state to InProgress

      // Try to assign again - should fail due to wrong state
      const anotherContributor = anchor.web3.Keypair.generate();
      try {
        await assignContributor(ctx, bountyId, anotherContributor.publicKey, 999);
        expect.fail("Should have failed - bounty not in Created state");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Invalid bounty state");
      }
    });

    it("should enforce InProgress state for complete_bounty", async () => {
      const bountyId = generateBountyId(81000);
      
      await createBounty(ctx, bountyId);
      // Don't assign contributor - stays in Created state

      try {
        await completeBounty(ctx, bountyId);
        expect.fail("Should have failed - bounty not in InProgress state");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Invalid bounty state");
      }
    });

    it("should allow cancel_bounty from both Created and InProgress states", async () => {
      // Test canceling from Created state
      const bountyId1 = generateBountyId(82000);
      await createBounty(ctx, bountyId1);
      await cancelBounty(ctx, bountyId1); // Should succeed

      // Test canceling from InProgress state  
      const bountyId2 = generateBountyId(83000);
      await createBounty(ctx, bountyId2);
      await assignContributor(ctx, bountyId2);
      await cancelBounty(ctx, bountyId2); // Should succeed
    });
  });
}); 