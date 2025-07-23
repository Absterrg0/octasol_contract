import * as anchor from '@coral-xyz/anchor';
import {
  setupTestEnvironment,
  TestContext,
  CONTRIBUTOR_GITHUB_ID,
  generateBountyId,
  getBountyPda,
  createBounty,
  assignContributor,
  expectConstraintError,
  expect
} from './setup';

describe("Authorization and Access Control", () => {
  let ctx: TestContext;
  let bountyId: number;
  let bountyPda: anchor.web3.PublicKey;
  let randomUser: anchor.web3.Keypair;

  before(async () => {
    ctx = await setupTestEnvironment();
  });

  beforeEach(async () => {
    bountyId = generateBountyId(60000);
    bountyPda = getBountyPda(ctx.program, bountyId);

    // Create a random user for unauthorized actions
    randomUser = anchor.web3.Keypair.generate();
    await ctx.connection.confirmTransaction(
      await ctx.connection.requestAirdrop(randomUser.publicKey, anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create and assign bounty
    await createBounty(ctx, bountyId);
    await assignContributor(ctx, bountyId);
  });

  it("should fail when random user tries to complete bounty", async () => {
    try {
      await ctx.program.methods
        .completeBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: randomUser.publicKey,
          contributor: ctx.contributor.publicKey,
          mint: ctx.mint,
        })
        .signers([randomUser])
        .rpc();
      
      expect.fail("Should have failed with unauthorized user");
    } catch (err) {
      expectConstraintError(err);
    }
  });

  it("should fail when random user tries to cancel bounty", async () => {
    try {
      await ctx.program.methods
        .cancelBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: randomUser.publicKey,
          mint: ctx.mint,
        })
        .signers([randomUser])
        .rpc();
      
      expect.fail("Should have failed with unauthorized user");
    } catch (err) {
      expectConstraintError(err);
    }
  });

  it("should fail when contributor tries to cancel bounty", async () => {
    try {
      await ctx.program.methods
        .cancelBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: ctx.contributor.publicKey,
          mint: ctx.mint,
        })
        .signers([ctx.contributor])
        .rpc();
      
      expect.fail("Should have failed - contributor cannot cancel");
    } catch (err) {
      expectConstraintError(err);
    }
  });

  it("should fail when contributor tries to assign different contributor", async () => {
    const anotherBountyId = generateBountyId(65000);
    
    // Create new bounty
    await createBounty(ctx, anotherBountyId);

    try {
      await ctx.program.methods
        .assignContributor(
          new anchor.BN(anotherBountyId),
          new anchor.BN(999)
        )
        .accountsPartial({
          maintainer: ctx.contributor.publicKey,
          contributor: randomUser.publicKey,
        })
        .signers([ctx.contributor])
        .rpc();
      
      expect.fail("Should have failed - contributor cannot assign");
    } catch (err) {
      expectConstraintError(err);
    }
  });

  it("should fail when random user tries to initialize bounty with wrong signer", async () => {
    const newBountyId = generateBountyId(66000);

    try {
      await ctx.program.methods
        .initializeBounty(
          new anchor.BN(newBountyId),
          new anchor.BN(5000),
          new anchor.BN(123),
          new anchor.BN(456)
        )
        .accountsPartial({
          maintainer: randomUser.publicKey,
          mint: ctx.mint,
        })
        .signers([ctx.maintainer]) // Wrong signer - should be randomUser
        .rpc();
      
      expect.fail("Should have failed with wrong signer");
    } catch (err) {
      expect(err).to.exist;
    }
  });

  it("should fail when contributor tries to complete bounty", async () => {
    try {
      await ctx.program.methods
        .completeBounty(new anchor.BN(bountyId))
        .accountsPartial({
          maintainer: ctx.contributor.publicKey,
          contributor: ctx.contributor.publicKey,
          mint: ctx.mint,
        })
        .signers([ctx.contributor])
        .rpc();
      
      expect.fail("Should have failed - contributor cannot complete");
    } catch (err) {
      expectConstraintError(err);
    }
  });

  it("should enforce maintainer-only operations", async () => {
    const operations = [
      {
        name: "assign_contributor",
        call: () => ctx.program.methods
          .assignContributor(new anchor.BN(bountyId), new anchor.BN(999))
          .accountsPartial({
            maintainer: randomUser.publicKey,
            contributor: randomUser.publicKey,
          })
          .signers([randomUser])
          .rpc()
      },
      {
        name: "complete_bounty", 
        call: () => ctx.program.methods
          .completeBounty(new anchor.BN(bountyId))
          .accountsPartial({
            maintainer: randomUser.publicKey,
            contributor: ctx.contributor.publicKey,
            mint: ctx.mint,
          })
          .signers([randomUser])
          .rpc()
      },
      {
        name: "cancel_bounty",
        call: () => ctx.program.methods
          .cancelBounty(new anchor.BN(bountyId))
          .accountsPartial({
            maintainer: randomUser.publicKey,
            mint: ctx.mint,
          })
          .signers([randomUser])
          .rpc()
      }
    ];

    for (const operation of operations) {
      try {
        await operation.call();
        expect.fail(`${operation.name} should have failed with unauthorized user`);
      } catch (err) {
        expectConstraintError(err);
      }
    }
  });
}); 