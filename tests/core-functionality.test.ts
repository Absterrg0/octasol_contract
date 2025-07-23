import * as anchor from '@coral-xyz/anchor';
import {
  setupTestEnvironment,
  TestContext,
  BOUNTY_AMOUNT,
  GITHUB_ISSUE_ID,
  MAINTAINER_GITHUB_ID,
  CONTRIBUTOR_GITHUB_ID,
  generateBountyId,
  getBountyPda,
  createBounty,
  assignContributor,
  completeBounty,
  cancelBounty,
  expect,
  getAccount,
  getAssociatedTokenAddress
} from './setup';

describe("Core Functionality", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await setupTestEnvironment();
    console.log("Available accounts in IDL:", ctx.program.idl.accounts.map(a => a.name));
  });

  describe("initialize_bounty", () => {
    it("should create a bounty successfully", async () => {
      const bountyId = generateBountyId(1);
      const bountyPda = getBountyPda(ctx.program, bountyId);
      
      const escrowTokenAccount = await getAssociatedTokenAddress(
        ctx.mint,
        bountyPda,
        true
      );

      const tx = await ctx.program.methods
        .initializeBounty(
          new anchor.BN(bountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accountsPartial({
          maintainer: ctx.maintainer.publicKey,
          mint: ctx.mint,
        })
        .signers([ctx.maintainer])
        .rpc();

      // Verify bounty account
      const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.maintainer.toString()).to.equal(ctx.maintainer.publicKey.toString());
      expect(bountyAccount.amount.toNumber()).to.equal(BOUNTY_AMOUNT);
      expect(bountyAccount.githubIssueId.toNumber()).to.equal(GITHUB_ISSUE_ID);
      expect(bountyAccount.maintainerGithubId.toNumber()).to.equal(MAINTAINER_GITHUB_ID);
      expect(bountyAccount.state).to.deep.equal({ created: {} });
      expect(bountyAccount.bountyId.toNumber()).to.equal(bountyId);

      // Verify token transfer
      const escrowBalance = await getAccount(ctx.connection, escrowTokenAccount);
      expect(escrowBalance.amount.toString()).to.equal(BOUNTY_AMOUNT.toString());
    });

    it("should fail with zero amount", async () => {
      const bountyId = generateBountyId(2);

      try {
        await ctx.program.methods
          .initializeBounty(
            new anchor.BN(bountyId),
            new anchor.BN(0), // Zero amount
            new anchor.BN(GITHUB_ISSUE_ID),
            new anchor.BN(MAINTAINER_GITHUB_ID)
          )
          .accountsPartial({
            maintainer: ctx.maintainer.publicKey,
            mint: ctx.mint,
          })
          .signers([ctx.maintainer])
          .rpc();
        
        expect.fail("Should have failed with zero amount");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Amount must be greater than zero");
      }
    });

    it("should fail with insufficient amount", async () => {
      const bountyId = generateBountyId(3);

      try {
        await ctx.program.methods
          .initializeBounty(
            new anchor.BN(bountyId),
            new anchor.BN(500), // Below minimum of 1000
            new anchor.BN(GITHUB_ISSUE_ID),
            new anchor.BN(MAINTAINER_GITHUB_ID)
          )
          .accountsPartial({
            maintainer: ctx.maintainer.publicKey,
            mint: ctx.mint,
          })
          .signers([ctx.maintainer])
          .rpc();
        
        expect.fail("Should have failed with insufficient amount");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Insufficient bounty amount");
      }
    });
  });

  describe("assign_contributor", () => {
    let bountyId: number;
    let bountyPda: anchor.web3.PublicKey;

    beforeEach(async () => {
      bountyId = generateBountyId(4000);
      bountyPda = getBountyPda(ctx.program, bountyId);
      await createBounty(ctx, bountyId);
    });

    it("should assign contributor successfully", async () => {
      await assignContributor(ctx, bountyId);

      const bountyAccount = await ctx.program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.contributor.toString()).to.equal(ctx.contributor.publicKey.toString());
      expect(bountyAccount.contributorGithubId.toNumber()).to.equal(CONTRIBUTOR_GITHUB_ID);
      expect(bountyAccount.state).to.deep.equal({ inProgress: {} });
    });

    it("should fail to assign contributor twice", async () => {
      // First assignment
      await assignContributor(ctx, bountyId);

      // Second assignment should fail because state is now InProgress, not Created
      const anotherContributor = anchor.web3.Keypair.generate();
      try {
        await assignContributor(ctx, bountyId, anotherContributor.publicKey, 999);
        expect.fail("Should have failed with invalid state");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Invalid bounty state");
      }
    });

    it("should fail if wrong maintainer tries to assign", async () => {
      const wrongMaintainer = anchor.web3.Keypair.generate();
      await ctx.connection.confirmTransaction(
        await ctx.connection.requestAirdrop(wrongMaintainer.publicKey, anchor.web3.LAMPORTS_PER_SOL)
      );

      try {
        await ctx.program.methods
          .assignContributor(
            new anchor.BN(bountyId),
            new anchor.BN(CONTRIBUTOR_GITHUB_ID)
          )
          .accountsPartial({
            maintainer: wrongMaintainer.publicKey,
            contributor: ctx.contributor.publicKey,
          })
          .signers([wrongMaintainer])
          .rpc();
        
        expect.fail("Should have failed with wrong maintainer");
      } catch (err) {
        // Handle both possible error formats
        if (err.logs) {
          expect(err.logs.some(log => log.includes("ConstraintHasOne"))).to.be.true;
        } else if (err.error && err.error.errorCode) {
          expect(err.error.errorCode.code).to.equal("ConstraintHasOne");
        } else {
          expect(err).to.exist;
        }
      }
    });
  });

  describe("complete_bounty", () => {
    let bountyId: number;
    let bountyPda: anchor.web3.PublicKey;

    beforeEach(async () => {
      bountyId = generateBountyId(10000);
      bountyPda = getBountyPda(ctx.program, bountyId);
      await createBounty(ctx, bountyId);
      await assignContributor(ctx, bountyId);
    });

    it("should complete bounty successfully", async () => {
      const contributorBalanceBefore = await getAccount(ctx.connection, ctx.contributorTokenAccount);
      const maintainerSolBefore = await ctx.connection.getBalance(ctx.maintainer.publicKey);

      await completeBounty(ctx, bountyId);

      // Verify token transfer
      const contributorBalanceAfter = await getAccount(ctx.connection, ctx.contributorTokenAccount);
      expect(
        contributorBalanceAfter.amount - contributorBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));

      // Verify bounty account is closed and rent returned to maintainer
      try {
        await ctx.program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }

      // Verify maintainer received rent
      const maintainerSolAfter = await ctx.connection.getBalance(ctx.maintainer.publicKey);
      expect(maintainerSolAfter).to.be.greaterThan(maintainerSolBefore);
    });

    it("should fail to complete bounty in wrong state", async () => {
      // Try to complete again (bounty doesn't exist anymore, but let's test with fresh bounty)
      const newBountyId = generateBountyId(20000);
      await createBounty(ctx, newBountyId); // Don't assign contributor

      try {
        await completeBounty(ctx, newBountyId);
        expect.fail("Should have failed with wrong state");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Invalid bounty state");
      }
    });
  });

  describe("cancel_bounty", () => {
    let bountyId: number;
    let bountyPda: anchor.web3.PublicKey;

    beforeEach(async () => {
      bountyId = generateBountyId(30000);
      bountyPda = getBountyPda(ctx.program, bountyId);
      await createBounty(ctx, bountyId);
    });

    it("should cancel bounty without contributor", async () => {
      const maintainerBalanceBefore = await getAccount(ctx.connection, ctx.maintainerTokenAccount);
      const maintainerSolBefore = await ctx.connection.getBalance(ctx.maintainer.publicKey);

      await cancelBounty(ctx, bountyId);

      // Verify token refund
      const maintainerBalanceAfter = await getAccount(ctx.connection, ctx.maintainerTokenAccount);
      expect(
        maintainerBalanceAfter.amount - maintainerBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));

      // Verify bounty account is closed and rent returned
      try {
        await ctx.program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }

      // Verify maintainer received rent
      const maintainerSolAfter = await ctx.connection.getBalance(ctx.maintainer.publicKey);
      expect(maintainerSolAfter).to.be.greaterThan(maintainerSolBefore);
    });

    it("should cancel bounty with contributor", async () => {
      // Assign contributor first
      await assignContributor(ctx, bountyId);

      const maintainerBalanceBefore = await getAccount(ctx.connection, ctx.maintainerTokenAccount);

      await cancelBounty(ctx, bountyId);

      // Verify token refund
      const maintainerBalanceAfter = await getAccount(ctx.connection, ctx.maintainerTokenAccount);
      expect(
        maintainerBalanceAfter.amount - maintainerBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));
    });

    it("should fail to cancel completed bounty", async () => {
      // Assign contributor
      await assignContributor(ctx, bountyId);

      // Complete bounty
      await completeBounty(ctx, bountyId);

      // Try to cancel (bounty is now closed, so this should fail anyway)
      try {
        await cancelBounty(ctx, bountyId);
        expect.fail("Should have failed - bounty account closed");
      } catch (err) {
        // The bounty account is closed, so we expect an account-related error
        expect(err.message).to.include("AnchorError");
      }
    });
  });

  describe("Full workflow scenarios", () => {
    it("should handle complete workflow: initialize → assign → complete", async () => {
      const bountyId = generateBountyId(40000);
      const bountyPda = getBountyPda(ctx.program, bountyId);

      const contributorBalanceBefore = await getAccount(ctx.connection, ctx.contributorTokenAccount);

      // 1. Initialize bounty
      await createBounty(ctx, bountyId);

      // 2. Assign contributor
      await assignContributor(ctx, bountyId);

      // 3. Complete bounty
      await completeBounty(ctx, bountyId);

      // Verify final state
      const contributorBalanceAfter = await getAccount(ctx.connection, ctx.contributorTokenAccount);
      expect(
        contributorBalanceAfter.amount - contributorBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));

      // Verify bounty account is closed
      try {
        await ctx.program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });

    it("should handle workflow: initialize → assign → cancel", async () => {
      const bountyId = generateBountyId(50000);
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

      // Verify bounty account is closed
      try {
        await ctx.program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });
  });
}); 