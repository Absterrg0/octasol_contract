import { assert, expect } from "chai";
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorError } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint, 
  createAssociatedTokenAccount, 
  mintTo, 
  getAssociatedTokenAddress,
  getAccount,
} from '@solana/spl-token';
import { OctasolContract } from '../target/types/octasol_contract';

// Helper to generate a random 64-bit number for the bounty ID
const generateBountyId = () => new anchor.BN(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

describe("Octasol Escrow Contract", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.OctasolContract as Program<OctasolContract>;
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;

  // Keypairs
  const maintainer = wallet.payer; // Use the wallet as the maintainer for simplicity
  const contributor = anchor.web3.Keypair.generate();
  const keeper = anchor.web3.Keypair.generate();
  
  // This is the Keypair for the main Bounty account that holds the state
  const bountyAccountKp = anchor.web3.Keypair.generate();

  // Declare variables in the outer scope
  let mint: PublicKey;
  let maintainerTokenAccount: PublicKey;
  let contributorTokenAccount: PublicKey;
  let escrowAuthorityPda: PublicKey;
  let escrowTokenAccount: PublicKey;
  const bountyId = generateBountyId();
  const BOUNTY_AMOUNT = new anchor.BN(10000); // Use BN for amounts

  before(async () => {
    // Airdrop SOL to the contributor so they can pay for transactions if needed
    await connection.confirmTransaction(
      await connection.requestAirdrop(contributor.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL),
      "confirmed"
    );

    // Create the token mint
    mint = await createMint(
      connection,
      wallet.payer,       // Payer
      wallet.publicKey,   // Mint Authority
      wallet.publicKey,   // Freeze Authority
      6                   // Decimals
    );

    // Create Associated Token Accounts for the maintainer and contributor
    maintainerTokenAccount = await createAssociatedTokenAccount(
      connection,
      wallet.payer,
      mint,
      maintainer.publicKey // Owner is the maintainer (our wallet)
    );

    contributorTokenAccount = await createAssociatedTokenAccount(
      connection,
      wallet.payer,
      mint,
      contributor.publicKey // Owner is the contributor
    );

    // Mint some tokens to the maintainer's token account so they can fund the bounty
    await mintTo(
      connection,
      wallet.payer,
      mint,
      maintainerTokenAccount,
      wallet.payer, // Mint authority
      1000000       // 1,000,000 tokens
    );

    // Derive the PDA for the escrow authority
    // This PDA is the sole authority over the escrow_token_account
    [escrowAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("escrow_auth"), bountyAccountKp.publicKey.toBuffer()],
        program.programId
    );

    // Derive the address for the escrow's token account (an ATA owned by the PDA)
    escrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        escrowAuthorityPda, // The owner is the PDA
        true // IMPORTANT: This must be true for PDA-owned accounts
    );
  });

  it("Initializes the bounty escrow successfully!", async () => {
    // Now you can write your test with the correctly initialized variables
    await program.methods
      .initializeBounty(bountyId, BOUNTY_AMOUNT)
      .accounts({
        maintainer: maintainer.publicKey,
        bounty: bountyAccountKp.publicKey,
        maintainerTokenAccount: maintainerTokenAccount,
        escrowAuthority: escrowAuthorityPda,
        keeper: keeper.publicKey,
        escrowTokenAccount: escrowTokenAccount,
        mint: mint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      // The bounty account is being created, so its keypair must sign the transaction
      .signers([bountyAccountKp])
      .rpc();

    // Fetch the created bounty account and assert its values
    const bountyAccount = await program.account.bounty.fetch(bountyAccountKp.publicKey);

    assert.ok(bountyAccount.maintainer.equals(maintainer.publicKey), "Maintainer public key should match");
    assert.ok(bountyAccount.keeper.equals(keeper.publicKey), "Keeper public key should match");
    assert.equal(bountyAccount.amount.toString(), BOUNTY_AMOUNT.toString(), "Bounty amount should match");
    assert.ok(bountyAccount.contributor === null, "Contributor should be null initially");
    assert.ok(bountyAccount.state.hasOwnProperty('created'), "Bounty state should be 'created'");

    // Check that the tokens were transferred to the escrow token account
    const escrowTokenAccountInfo = await getAccount(connection, escrowTokenAccount);
    assert.equal(escrowTokenAccountInfo.amount.toString(), BOUNTY_AMOUNT.toString(), "Escrow token account balance should match bounty amount");
  });

  it("Assigns a contributor to the bounty successfully!", async () => {
    try {
        // Call the assignContributor instruction
        await program.methods
            .assignContributor()
            .accounts({
                maintainer: maintainer.publicKey,
                bounty: bountyAccountKp.publicKey,
                contributor: contributor.publicKey,
                systemProgram: SystemProgram.programId, // Often not needed but doesn't hurt
            })
            // The maintainer is the wallet, which signs by default, so no .signers() is needed.
            .rpc();
    } catch (error) {
        console.error("Transaction failed:", error);
        // It's useful to log the detailed error from the program if it's an AnchorError
        if (error instanceof AnchorError) {
            console.error("AnchorError:", error.error);
            console.error("Error Logs:", error.logs);
        }
        // Fail the test explicitly if the transaction fails, providing a clear message.
        assert.fail("The 'assignContributor' transaction failed to execute.");
    }

    // Fetch the updated bounty account state
    const updatedBountyAccount = await program.account.bounty.fetch(bountyAccountKp.publicKey);


    
    // --- Assertions ---

    // 1. Assert that the contributor field is no longer null. This is a crucial check.
    assert.ok(updatedBountyAccount.contributor, "Contributor field should be populated but it is null.");

    // 2. Assert that the contributor public key is correct
    assert.ok(
        updatedBountyAccount.contributor.equals(contributor.publicKey),
        `Contributor public key mismatch. Expected ${contributor.publicKey.toBase58()}, but got ${updatedBountyAccount.contributor.toBase58()}`
    );

    // 3. Assert that the state has been updated to 'Assigned'
    // The state object from an enum will be in the form { assigned: {} }
    assert.ok(updatedBountyAccount.state.hasOwnProperty('inProgress'), "Bounty state should be 'InProg'.");
  });
    
  it("Completes the bounty and pays the contributor!", async () => {
    try {
        // Call the completeBounty instruction
        // CORRECTED: Pass the bountyId as required by the Rust function
        await program.methods
            .completeBounty(bountyId) 
            .accounts({
                bounty: bountyAccountKp.publicKey,
                escrowAuthority: escrowAuthorityPda,
                maintainer:maintainer.publicKey,
                contributor: contributor.publicKey,
                keeper: keeper.publicKey,
                contributorTokenAccount: contributorTokenAccount,
                escrowTokenAccount: escrowTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            // The keeper must sign to authorize the payment
            .signers([keeper])
            .rpc();
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof AnchorError) {
            console.error("AnchorError:", error.error);
            console.error("Error Logs:", error.logs);
        }
        assert.fail("The 'completeBounty' transaction failed to execute.");
    }

    // --- Assertions ---


    // 1. Check contributor's new balance
    const contributorTokenAccountInfo = await getAccount(connection, contributorTokenAccount);
    assert.equal(
        contributorTokenAccountInfo.amount.toString(), 
        BOUNTY_AMOUNT.toString(),
        "Contributor token account should have received the bounty amount."
    );

    // 2. Check that the escrow token account is now empty
    const escrowTokenAccountInfo = await getAccount(connection, escrowTokenAccount);
    assert.equal(
        escrowTokenAccountInfo.amount.toString(), 
        "0",
        "Escrow token account should be empty."
    );


    console.log("Bounty successfully completed and contributor paid!");
  });

  it("Cancels the bounty and returns funds to the maintainer!", async () => {
    // --- Setup a new, independent bounty for this test ---
    const cancelBountyKp = anchor.web3.Keypair.generate();
    const cancelBountyId = generateBountyId();
    const cancelKeeper = anchor.web3.Keypair.generate();
    const cancelContributor = anchor.web3.Keypair.generate();
    const initialMaintainerBalance = (await getAccount(connection, maintainerTokenAccount)).amount;

    // Derive the PDA for the new escrow authority
    const [cancelEscrowAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("escrow_auth"), cancelBountyKp.publicKey.toBuffer()],
        program.programId
    );

    // Derive the address for the new escrow's token account
    const cancelEscrowTokenAccount = await getAssociatedTokenAddress(
        mint,
        cancelEscrowAuthorityPda,
        true
    );

    // 1. Initialize the new bounty
    await program.methods
        .initializeBounty(cancelBountyId, BOUNTY_AMOUNT)
        .accounts({
            maintainer: maintainer.publicKey,
            bounty: cancelBountyKp.publicKey,
            maintainerTokenAccount: maintainerTokenAccount,
            escrowAuthority: cancelEscrowAuthorityPda,
            keeper: cancelKeeper.publicKey,
            escrowTokenAccount: cancelEscrowTokenAccount,
            mint: mint,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([cancelBountyKp])
        .rpc();

    // 2. Assign a contributor to it
    await program.methods
        .assignContributor()
        .accounts({
            maintainer: maintainer.publicKey,
            bounty: cancelBountyKp.publicKey,
            contributor: cancelContributor.publicKey,
            systemProgram: SystemProgram.programId,
        })
        .rpc();

    // --- Execute the cancelBounty instruction ---
    try {
        await program.methods
            .cancelBounty() // Assuming cancelBounty takes no args
            .accounts({
                bounty: cancelBountyKp.publicKey,
                maintainer: maintainer.publicKey,
                escrowAuthority: cancelEscrowAuthorityPda,
                escrowTokenAccount: cancelEscrowTokenAccount,
                maintainerTokenAccount: maintainerTokenAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            // Maintainer (the wallet) signs by default
            .rpc();
    } catch (error) {
        console.error("Transaction failed:", error);
        if (error instanceof AnchorError) {
            console.error("AnchorError:", error.error);
            console.error("Error Logs:", error.logs);
        }
        assert.fail("The 'cancelBounty' transaction failed to execute.");
    }

    // --- Assertions ---

    // 1. Check that the funds were returned to the maintainer.
    const finalMaintainerBalance = (await getAccount(connection, maintainerTokenAccount)).amount;
    assert.equal(
        finalMaintainerBalance.toString(),
        initialMaintainerBalance.toString(),
        "Maintainer's token balance should be restored to its initial amount."
    );

    // 2. Check that the escrow token account is closed.
    try {
        await getAccount(connection, cancelEscrowTokenAccount);
        assert.fail("Escrow token account for cancelled bounty should be closed.");
    } catch (error) {
        assert.isOk(error, "Successfully confirmed escrow token account is closed.");
    }

    // 3. Check that the bounty account is closed.
    try {
        await program.account.bounty.fetch(cancelBountyKp.publicKey);
        assert.fail("Cancelled bounty account should be closed.");
    } catch (error) {
        assert.isOk(error, "Successfully confirmed bounty account is closed.");
    }

    console.log("Bounty successfully cancelled and funds returned to maintainer!");
  });
});
