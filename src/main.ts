import {
    Keypair,
    PublicKey,
    clusterApiUrl,
    Connection,
    LAMPORTS_PER_SOL,
    Account,
} from "@solana/web3.js"

import {
    createAccount,
    createMint,
    mintTo,
    TOKEN_PROGRAM_ID,
    approve,
    getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

import {
    TokenSwap,
    CurveType,
    Numberu64,
} from "@solana/spl-token-swap";


const TOKEN_SWAP_PROGRAM_ID: PublicKey = new PublicKey(
    "SwapsVeCiPHMUAtzQWZw7RjsKjgCjhwU55QGu4U1Szw",
);

const SWAP_PROGRAM_OWNER_FEE_ADDRESS: PublicKey = new PublicKey(
    "HfoTxFR1Tm6kGmWgYWD6J7YHVy1UwqSULUGVLXkJqaKN"
);

let tokenSwap: TokenSwap;
let authority: PublicKey;
let bumpSeed: number;
let owner: Keypair;
let tokenPool: PublicKey;
let tokenAccountPool: Account;
let feeAccount: PublicKey;
let mintA: PublicKey;
let mintB: PublicKey;
let tokenAccountA: PublicKey;
let tokenAccountB: PublicKey;


const TRADING_FEE_NUMERATOR = 25;
const TRADING_FEE_DENOMINATOR = 10000;
const OWNER_TRADING_FEE_NUMERATOR = 5;
const OWNER_TRADING_FEE_DENOMINATOR = 10000;
const OWNER_WITHDRAW_FEE_NUMERATOR = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? 0 : 1;
const OWNER_WITHDRAW_FEE_DENOMINATOR = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? 0 : 6;
const HOST_FEE_NUMERATOR = 20;
const HOST_FEE_DENOMINATOR = 100;

let currentSwapTokenA = 1000000;
let currentSwapTokenB = 1000000;

const SWAP_AMOUNT_IN = 100000;
const SWAP_AMOUNT_OUT = SWAP_PROGRAM_OWNER_FEE_ADDRESS ? 90661 : 90674;

 const connection = new Connection(clusterApiUrl("devnet"));
//const connection = new Connection("http://127.0.0.1:8899", "confirmed");


export async function onSwap(): Promise<void> {
    await createTokenSwap();
    await sleep(1000);
    await swap();
}


async function createTokenSwap(): Promise<void> {
    owner = new Keypair(); 
    console.log("owner:", owner.publicKey.toString());
    await requestLamports(owner.publicKey,  LAMPORTS_PER_SOL * 10);

    const swapPayer = new Account();
    console.log("swapPayer:", swapPayer.publicKey.toString());
    await requestLamports(swapPayer.publicKey,  LAMPORTS_PER_SOL * 10);

    const tokenSwapAccount = new Account();

    [authority, bumpSeed] = await PublicKey.findProgramAddress(
        [tokenSwapAccount.publicKey.toBuffer()],
        TOKEN_SWAP_PROGRAM_ID
    );

    console.log("tokenSwapAccount:", tokenSwapAccount.publicKey.toString());

    console.log("Creating pool mint");
    tokenPool = await createMint(
        connection, 
        owner, 
        authority, 
        null, 
        2
    );
    console.log("tokenPool:", tokenPool.toString());

    console.log("Creating pool account");
    tokenAccountPool = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        tokenPool,
        owner.publicKey
    );
    console.log("tokenAccountPool:", tokenAccountPool.address.toString());

    feeAccount = await createAccount(
        connection,
        owner,
        tokenPool,
        owner.publicKey,
        new Keypair()
    );
    console.log("feeAccount:", feeAccount.toString());

    await createTokenAccounts();

    tokenSwap = await TokenSwap.createTokenSwap(
        connection,
        swapPayer, // Pays for the transaction, requires type "Account" even though depreciated
        tokenSwapAccount, // The token swap account, requires type "Account" even though depreciated
        authority, // The authority over the swap and accounts
        tokenAccountA, // The token swap's Token A account, owner is authority (PDA)
        tokenAccountB, // The token swap's Token B account, owner is authority (PDA)
        tokenPool, // The pool token MINT
        mintA, // The mint of Token A
        mintB, // The mint of Token B
        feeAccount, // pool token TOKEN ACCOUNT where fees are sent
        tokenAccountPool.address, // pool token TOKEN ACCOUNT where initial pool tokens are minted to when creating Token Swap
        TOKEN_SWAP_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        TRADING_FEE_NUMERATOR,
        TRADING_FEE_DENOMINATOR,
        OWNER_TRADING_FEE_NUMERATOR,
        OWNER_TRADING_FEE_DENOMINATOR,
        OWNER_WITHDRAW_FEE_NUMERATOR,
        OWNER_WITHDRAW_FEE_DENOMINATOR,
        HOST_FEE_NUMERATOR, // NOTE: not sure what HOST refers to
        HOST_FEE_DENOMINATOR,
        CurveType.ConstantPrice, // NOTE: not really sure CurveType calculations, constant price/product
        new Numberu64(1) // NOTE: not sure what curveParameters number means
    );
    console.log("Token swap: ", tokenSwap);
}


async function createTokenAccounts() {
    console.log("creating token A");
    mintA = await createMint(connection, owner, owner.publicKey, null, 2);
    console.log("mintA:", mintA.toString());

    tokenAccountA = await createAccount(
        connection,
        owner,
        mintA,
        authority,
        new Keypair()
    );
    console.log("tokenAccountA:", tokenAccountA.toString());
    await mintTo(
        connection,
        owner,
        mintA,
        tokenAccountA,
        owner,
        currentSwapTokenA
    );

    console.log("Creating token B");
    mintB = await createMint(connection, owner, owner.publicKey, null, 2);
    console.log("mintB:", mintB.toString());

    tokenAccountB = await createAccount(
        connection,
        owner,
        mintB,
        authority,
        new Keypair()
    );
    console.log("tokenAccountB:", tokenAccountB.toString());
    await mintTo(
        connection,
        owner,
        mintB,
        tokenAccountB,
        owner,
        currentSwapTokenB
    );
}


async function swap(): Promise<void> {
    console.log("Creating swap token a account");
    const userAccountA = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        mintA,
        owner.publicKey
    );

    await mintTo(
        connection,
        owner,
        mintA,
        userAccountA.address,
        owner,
        SWAP_AMOUNT_IN
    );
    const userTransferAuthority = new Account();
    await approve(
        connection,
        owner,
        userAccountA.address,
        userTransferAuthority.publicKey,
        owner,
        SWAP_AMOUNT_IN
    );

    console.log("Creating swap token b account");
    const userAccountB = await getOrCreateAssociatedTokenAccount(
        connection,
        owner,
        mintB,
        owner.publicKey
    );

    let swapFeeAccount = await createAccount(
        connection,
        owner,
        tokenPool,
        owner.publicKey,
        new Keypair()
    );

    console.log("Swapping");
    const swap = await tokenSwap.swap(
        userAccountA.address,
        tokenAccountA,
        tokenAccountB,
        userAccountB.address,
        swapFeeAccount,
        userTransferAuthority,
        SWAP_AMOUNT_IN,
        SWAP_AMOUNT_OUT
    );
    console.log("Swap Transation:", swap);
    await sleep(1000);
}


function sleep(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

async function requestLamports(
    publicKey: PublicKey,
    lamports: number = 1000000,
): Promise<void> {
    let retries = 30;
    await connection.requestAirdrop(publicKey, lamports);
    for (;;) {
        await sleep(500);
        if (lamports == (await connection.getBalance(publicKey))) {
            return;
        }
        if (--retries <= 0) {
            break;
        }
    }
    throw new Error(`Airdrop of ${lamports} failed`);
}

