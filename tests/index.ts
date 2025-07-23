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

describe("OctasolContract", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OctasolContract as Program<OctasolContract>;
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;

  let maintainer: anchor.web3.Keypair;
  let contributor: anchor.web3.Keypair;
  let mint: anchor.web3.PublicKey;
  let maintainerTokenAccount: anchor.web3.PublicKey;
  let contributorTokenAccount: anchor.web3.PublicKey;

  const BOUNTY_AMOUNT = 5000; // Above minimum of 1000
  const GITHUB_ISSUE_ID = 123;
  const MAINTAINER_GITHUB_ID = 456;
  const CONTRIBUTOR_GITHUB_ID = 789;

  before(async () => {
    // Generate keypairs
    maintainer = anchor.web3.Keypair.generate();
    contributor = anchor.web3.Keypair.generate();

    // Airdrop SOL to maintainer and contributor
    await connection.confirmTransaction(
      await connection.requestAirdrop(maintainer.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );
    await connection.confirmTransaction(
      await connection.requestAirdrop(contributor.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );

    // Create mint
    mint = await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      6 // 6 decimals
    );

    // Create token accounts
    maintainerTokenAccount = await createAssociatedTokenAccount(
      connection,
      wallet.payer,
      mint,
      maintainer.publicKey
    );

    contributorTokenAccount = await createAssociatedTokenAccount(
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
  });

  describe("initialize_bounty", () => {
    it("should create a bounty successfully", async () => {
      const bountyId = 1;
      const [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      const tx = await program.methods
        .initializeBounty(
          new anchor.BN(bountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          maintainerTokenAccount,
          escrowTokenAccount,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([maintainer])
        .rpc();

      // Verify bounty account
      const bountyAccount = await program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.maintainer.toString()).to.equal(maintainer.publicKey.toString());
      expect(bountyAccount.amount.toNumber()).to.equal(BOUNTY_AMOUNT);
      expect(bountyAccount.githubIssueId.toNumber()).to.equal(GITHUB_ISSUE_ID);
      expect(bountyAccount.maintainerGithubId.toNumber()).to.equal(MAINTAINER_GITHUB_ID);
      expect(bountyAccount.state).to.deep.equal({ created: {} });
      expect(bountyAccount.bountyId.toNumber()).to.equal(bountyId);

      // Verify token transfer
      const escrowBalance = await getAccount(connection, escrowTokenAccount);
      expect(escrowBalance.amount.toString()).to.equal(BOUNTY_AMOUNT.toString());
    });

    it("should fail with zero amount", async () => {
      const bountyId = 2;
      const [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      try {
        await program.methods
          .initializeBounty(
            new anchor.BN(bountyId),
            new anchor.BN(0), // Zero amount
            new anchor.BN(GITHUB_ISSUE_ID),
            new anchor.BN(MAINTAINER_GITHUB_ID)
          )
          .accounts({
            bounty: bountyPda,
            maintainer: maintainer.publicKey,
            maintainerTokenAccount,
            escrowTokenAccount,
            mint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([maintainer])
          .rpc();
        
        expect.fail("Should have failed with zero amount");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Amount must be greater than zero");
      }
    });

    it("should fail with insufficient amount", async () => {
      const bountyId = 3;
      const [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      try {
        await program.methods
          .initializeBounty(
            new anchor.BN(bountyId),
            new anchor.BN(500), // Below minimum of 1000
            new anchor.BN(GITHUB_ISSUE_ID),
            new anchor.BN(MAINTAINER_GITHUB_ID)
          )
          .accounts({
            bounty: bountyPda,
            maintainer: maintainer.publicKey,
            maintainerTokenAccount,
            escrowTokenAccount,
            mint,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([maintainer])
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
      bountyId = Math.floor(Math.random() * 1000000) + 4;
      [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      // Create bounty first
      await program.methods
        .initializeBounty(
          new anchor.BN(bountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          maintainerTokenAccount,
          escrowTokenAccount,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([maintainer])
        .rpc();
    });

    it("should assign contributor successfully", async () => {
      await program.methods
        .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
        })
        .signers([maintainer])
        .rpc();

      const bountyAccount = await program.account.bounty.fetch(bountyPda);
      expect(bountyAccount.contributor.toString()).to.equal(contributor.publicKey.toString());
      expect(bountyAccount.contributorGithubId.toNumber()).to.equal(CONTRIBUTOR_GITHUB_ID);
      expect(bountyAccount.state).to.deep.equal({ inProgress: {} });
    });

    it("should fail to assign contributor twice", async () => {
      // First assignment
      await program.methods
        .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
        })
        .signers([maintainer])
        .rpc();

      // Second assignment should fail because state is now InProgress, not Created
      const anotherContributor = anchor.web3.Keypair.generate();
      try {
        await program.methods
          .assignContributor(new anchor.BN(999))
          .accounts({
            bounty: bountyPda,
            maintainer: maintainer.publicKey,
            contributor: anotherContributor.publicKey,
          })
          .signers([maintainer])
          .rpc();
        
        expect.fail("Should have failed with invalid state");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Invalid bounty state");
      }
    });

    it("should fail if wrong maintainer tries to assign", async () => {
      const wrongMaintainer = anchor.web3.Keypair.generate();
      await connection.confirmTransaction(
        await connection.requestAirdrop(wrongMaintainer.publicKey, anchor.web3.LAMPORTS_PER_SOL)
      );

      try {
        await program.methods
          .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
          .accounts({
            bounty: bountyPda,
            maintainer: wrongMaintainer.publicKey,
            contributor: contributor.publicKey,
          })
          .signers([wrongMaintainer])
          .rpc();
        
        expect.fail("Should have failed with wrong maintainer");
      } catch (err) {
        expect(err.logs.some(log => log.includes("ConstraintHasOne"))).to.be.true;
      }
    });
  });

  describe("complete_bounty", () => {
    let bountyId: number;
    let bountyPda: anchor.web3.PublicKey;
    let escrowTokenAccount: anchor.web3.PublicKey;

    beforeEach(async () => {
      bountyId = Math.floor(Math.random() * 1000000) + 10000;
      [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      // Create and assign bounty
      await program.methods
        .initializeBounty(
          new anchor.BN(bountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          maintainerTokenAccount,
          escrowTokenAccount,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([maintainer])
        .rpc();

      await program.methods
        .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
        })
        .signers([maintainer])
        .rpc();
    });

    it("should complete bounty successfully", async () => {
      const contributorBalanceBefore = await getAccount(connection, contributorTokenAccount);
      const maintainerSolBefore = await connection.getBalance(maintainer.publicKey);

      await program.methods
        .completeBounty()
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
          mint,
          escrowTokenAccount,
          contributorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maintainer])
        .rpc();

      // Verify token transfer
      const contributorBalanceAfter = await getAccount(connection, contributorTokenAccount);
      expect(
        contributorBalanceAfter.amount - contributorBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));

      // Verify bounty account is closed and rent returned to maintainer
      try {
        await program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }

      // Verify maintainer received rent
      const maintainerSolAfter = await connection.getBalance(maintainer.publicKey);
      expect(maintainerSolAfter).to.be.greaterThan(maintainerSolBefore);
    });

    it("should fail to complete bounty in wrong state", async () => {
      // Try to complete again (bounty doesn't exist anymore, but let's test with fresh bounty)
      const newBountyId = Math.floor(Math.random() * 1000000) + 20000;
      const [newBountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(newBountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const newEscrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        newBountyPda,
        true
      );

      // Create bounty but don't assign contributor
      await program.methods
        .initializeBounty(
          new anchor.BN(newBountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accounts({
          bounty: newBountyPda,
          maintainer: maintainer.publicKey,
          maintainerTokenAccount,
          escrowTokenAccount: newEscrowTokenAccount,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([maintainer])
        .rpc();

      try {
        await program.methods
          .completeBounty()
          .accounts({
            bounty: newBountyPda,
            maintainer: maintainer.publicKey,
            contributor: contributor.publicKey,
            mint,
            escrowTokenAccount: newEscrowTokenAccount,
            contributorTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([maintainer])
          .rpc();
        
        expect.fail("Should have failed with wrong state");
      } catch (err) {
        expect(err.error.errorMessage).to.include("Invalid bounty state");
      }
    });
  });

  describe("cancel_bounty", () => {
    let bountyId: number;
    let bountyPda: anchor.web3.PublicKey;
    let escrowTokenAccount: anchor.web3.PublicKey;

    beforeEach(async () => {
      bountyId = Math.floor(Math.random() * 1000000) + 30000;
      [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      // Create bounty
      await program.methods
        .initializeBounty(
          new anchor.BN(bountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          maintainerTokenAccount,
          escrowTokenAccount,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([maintainer])
        .rpc();
    });

    it("should cancel bounty without contributor", async () => {
      const maintainerBalanceBefore = await getAccount(connection, maintainerTokenAccount);
      const maintainerSolBefore = await connection.getBalance(maintainer.publicKey);

      await program.methods
        .cancelBounty()
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          mint,
          escrowTokenAccount,
          maintainerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maintainer])
        .rpc();

      // Verify token refund
      const maintainerBalanceAfter = await getAccount(connection, maintainerTokenAccount);
      expect(
        maintainerBalanceAfter.amount - maintainerBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));

      // Verify bounty account is closed and rent returned
      try {
        await program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }

      // Verify maintainer received rent
      const maintainerSolAfter = await connection.getBalance(maintainer.publicKey);
      expect(maintainerSolAfter).to.be.greaterThan(maintainerSolBefore);
    });

    it("should cancel bounty with contributor", async () => {
      // Assign contributor first
      await program.methods
        .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
        })
        .signers([maintainer])
        .rpc();

      const maintainerBalanceBefore = await getAccount(connection, maintainerTokenAccount);

      await program.methods
        .cancelBounty()
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          mint,
          escrowTokenAccount,
          maintainerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maintainer])
        .rpc();

      // Verify token refund
      const maintainerBalanceAfter = await getAccount(connection, maintainerTokenAccount);
      expect(
        maintainerBalanceAfter.amount - maintainerBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));
    });

    it("should fail to cancel completed bounty", async () => {
      // Assign contributor
      await program.methods
        .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
        })
        .signers([maintainer])
        .rpc();

      // Complete bounty
      await program.methods
        .completeBounty()
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
          mint,
          escrowTokenAccount,
          contributorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maintainer])
        .rpc();

      // Try to cancel (bounty is now closed, so this should fail anyway)
      try {
        await program.methods
          .cancelBounty()
          .accounts({
            bounty: bountyPda,
            maintainer: maintainer.publicKey,
            mint,
            escrowTokenAccount,
            maintainerTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([maintainer])
          .rpc();
        
        expect.fail("Should have failed - bounty account closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });
  });

  describe("Full workflow scenarios", () => {
    it("should handle complete workflow: initialize → assign → complete", async () => {
      const bountyId = Math.floor(Math.random() * 1000000) + 40000;
      const [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      const contributorBalanceBefore = await getAccount(connection, contributorTokenAccount);

      // 1. Initialize bounty
      await program.methods
        .initializeBounty(
          new anchor.BN(bountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          maintainerTokenAccount,
          escrowTokenAccount,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([maintainer])
        .rpc();

      // 2. Assign contributor
      await program.methods
        .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
        })
        .signers([maintainer])
        .rpc();

      // 3. Complete bounty
      await program.methods
        .completeBounty()
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
          mint,
          escrowTokenAccount,
          contributorTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maintainer])
        .rpc();

      // Verify final state
      const contributorBalanceAfter = await getAccount(connection, contributorTokenAccount);
      expect(
        contributorBalanceAfter.amount - contributorBalanceBefore.amount
      ).to.equal(BigInt(BOUNTY_AMOUNT));

      // Verify bounty account is closed
      try {
        await program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });

    it("should handle workflow: initialize → assign → cancel", async () => {
      const bountyId = Math.floor(Math.random() * 1000000) + 50000;
      const [bountyPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("bounty"), new anchor.BN(bountyId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        bountyPda,
        true
      );

      const maintainerBalanceBefore = await getAccount(connection, maintainerTokenAccount);

      // 1. Initialize bounty
      await program.methods
        .initializeBounty(
          new anchor.BN(bountyId),
          new anchor.BN(BOUNTY_AMOUNT),
          new anchor.BN(GITHUB_ISSUE_ID),
          new anchor.BN(MAINTAINER_GITHUB_ID)
        )
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          maintainerTokenAccount,
          escrowTokenAccount,
          mint,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([maintainer])
        .rpc();

      // 2. Assign contributor
      await program.methods
        .assignContributor(new anchor.BN(CONTRIBUTOR_GITHUB_ID))
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          contributor: contributor.publicKey,
        })
        .signers([maintainer])
        .rpc();

      // 3. Cancel bounty
      await program.methods
        .cancelBounty()
        .accounts({
          bounty: bountyPda,
          maintainer: maintainer.publicKey,
          mint,
          escrowTokenAccount,
          maintainerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([maintainer])
        .rpc();

      // Verify tokens returned to maintainer
      const maintainerBalanceAfter = await getAccount(connection, maintainerTokenAccount);
      expect(
        maintainerBalanceAfter.amount - maintainerBalanceBefore.amount
      ).to.equal(BigInt(0)); // Net change should be 0 (deposited then withdrawn)

      // Verify bounty account is closed
      try {
        await program.account.bounty.fetch(bountyPda);
        expect.fail("Bounty account should be closed");
      } catch (err) {
        expect(err.message).to.include("Account does not exist");
      }
    });
  });
});