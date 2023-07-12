import {
  Account,
  Address,
  Contract,
  hash,
  Keypair,
  Memo,
  MemoType,
  nativeToScVal,
  Operation,
  Server,
  SorobanRpc,
  StrKey,
  TimeoutInfinite,
  Transaction,
  TransactionBuilder,
  xdr,
} from "soroban-client";
import BigNumber from "bignumber.js";

import { NetworkDetails } from "./network";
import { I128 } from "./xdr";
import { ERRORS } from "./error";

export const SendTxStatus: {
  [index: string]: SorobanRpc.SendTransactionStatus;
} = {
  Pending: "PENDING",
  Duplicate: "DUPLICATE",
  Retry: "TRY_AGAIN_LATER",
  Error: "ERROR",
};

export const GetTxStatus: {
  [index: string]: SorobanRpc.GetTransactionStatus;
} = {
  Success: "SUCCESS",
  NotFound: "NOT_FOUND",
  Failed: "FAILED",
};

export const BASE_FEE = "100";

export const RPC_URLS: { [key: string]: string } = {
  FUTURENET: "https://rpc-futurenet.stellar.org/",
};

export const accountToScVal = (account: string) =>
  new Address(account).toScVal();

// Helper used in SCVal conversion
const bigintToBuf = (bn: bigint): Buffer => {
  let hex = BigInt(bn).toString(16).replace(/^-/, "");
  if (hex.length % 2) {
    hex = `0${hex}`;
  }

  const len = hex.length / 2;
  const u8 = new Uint8Array(len);

  let i = 0;
  let j = 0;
  while (i < len) {
    u8[i] = parseInt(hex.slice(j, j + 2), 16);
    i += 1;
    j += 2;
  }

  if (bn < BigInt(0)) {
    // Set the top bit
    u8[0] |= 0x80;
  }

  return Buffer.from(u8);
};

// Helper used in SCVal conversion
const bigNumberFromBytes = (
  signed: boolean,
  ...bytes: (string | number | bigint)[]
): BigNumber => {
  let sign = 1;
  if (signed && bytes[0] === 0x80) {
    // top bit is set, negative number.
    sign = -1;
    bytes[0] &= 0x7f;
  }
  let b = BigInt(0);
  for (const byte of bytes) {
    b <<= BigInt(8);
    b |= BigInt(byte);
  }
  return BigNumber(b.toString()).multipliedBy(sign);
};

// Can be used whenever you need an i128 argument for a contract method
export const numberToI128 = (value: number): xdr.ScVal => {
  const bigValue = BigNumber(value);
  const b: bigint = BigInt(bigValue.toFixed(0));
  const buf = bigintToBuf(b);
  if (buf.length > 16) {
    throw new Error("BigNumber overflows i128");
  }

  if (bigValue.isNegative()) {
    // Clear the top bit
    buf[0] &= 0x7f;
  }

  // left-pad with zeros up to 16 bytes
  const padded = Buffer.alloc(16);
  buf.copy(padded, padded.length - buf.length);
  console.debug({ value: value.toString(), padded });

  if (bigValue.isNegative()) {
    // Set the top bit
    padded[0] |= 0x80;
  }

  const hi = new xdr.Int64([
    bigNumberFromBytes(false, ...padded.slice(4, 8)).toNumber(),
    bigNumberFromBytes(false, ...padded.slice(0, 4)).toNumber(),
  ]);
  const lo = new xdr.Uint64([
    bigNumberFromBytes(false, ...padded.slice(12, 16)).toNumber(),
    bigNumberFromBytes(false, ...padded.slice(8, 12)).toNumber(),
  ]);

  return xdr.ScVal.scvI128(new xdr.Int128Parts({ lo, hi }));
};

const numberToU64 = (value: string) => {
  const bigi = BigInt(value);
  return new xdr.Uint64([
    Number(BigInt.asUintN(32, bigi)),
    Number(BigInt.asUintN(64, bigi) >> 32n),
  ]);
};

// XDR -> Number
export const decodeu32 = (xdrStr: string) => {
  const val = xdr.ScVal.fromXDR(xdrStr, "base64");
  return val.u32();
};

// XDR -> String
export const decodeBytesN = (xdrStr: string) => {
  const val = xdr.ScVal.fromXDR(xdrStr, "base64");
  return val.bytes().toString();
};

export const decoders = {
  bytesN: decodeBytesN,
  u32: decodeu32,
};

export const valueToI128String = (value: xdr.ScVal) =>
  new I128([
    BigInt(value.i128().lo().low),
    BigInt(value.i128().lo().high),
    BigInt(value.i128().hi().low),
    BigInt(value.i128().hi().high),
  ]).toString();

// Get a server configfured for a specific network
export const getServer = (networkDetails: NetworkDetails) =>
  new Server(RPC_URLS[networkDetails.network], {
    allowHttp: networkDetails.networkUrl.startsWith("http://"),
  });

//  Can be used whenever we need to perform a "read-only" operation
//  Used in getTokenSymbol, getTokenName, and getTokenDecimals
export const simulateTx = async <ArgType>(
  tx: Transaction<Memo<MemoType>, Operation[]>,
  decoder: (xdr: string) => ArgType,
  server: Server,
) => {
  const { results } = await server.simulateTransaction(tx);
  if (!results || results.length !== 1) {
    throw new Error("Invalid response from simulateTransaction");
  }
  const result = results[0];
  return decoder(result.xdr);
};

// Get the tokens decimals, decoded as a number
export const getTokenDecimals = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: Server,
) => {
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(contract.call("decimals"))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await simulateTx<number>(tx, decoders.u32, server);
  return result;
};

// Get a TransactionBuilder configured with our public key
export const getTxBuilder = async (
  pubKey: string,
  fee: string,
  server: Server,
  networkPassphrase: string,
) => {
  const source = await server.getAccount(pubKey);
  return new TransactionBuilder(source, {
    fee,
    networkPassphrase,
  });
};

export const buildSwap = async (
  contractID: string,
  tokenA: {
    id: string;
    amount: number;
    minAmount: number;
  },
  tokenB: {
    id: string;
    amount: number;
    minAmount: number;
  },
  swapperAPubKey: string,
  swapperBPubKey: string,
  memo: string,
  server: Server,
  networkPassphrase: string,
  txBuilder: TransactionBuilder,
) => {
  const swapContract = new Contract(contractID);
  const contractA = new Contract(tokenA.id);
  const contractB = new Contract(tokenB.id);

  const tx = txBuilder
    .addOperation(
      swapContract.call(
        "swap",
        ...[
          accountToScVal(swapperAPubKey),
          accountToScVal(swapperBPubKey),
          accountToScVal(contractA.contractId()),
          accountToScVal(contractB.contractId()),
          numberToI128(tokenA.amount),
          numberToI128(tokenA.minAmount),
          numberToI128(tokenB.amount),
          numberToI128(tokenB.minAmount),
        ],
      ),
    )
    .setTimeout(TimeoutInfinite);

  if (memo.length > 0) {
    tx.addMemo(Memo.text(memo));
  }

  const preparedTransaction = await server.prepareTransaction(
    tx.build(),
    networkPassphrase,
  );

  return preparedTransaction as Transaction<Memo<MemoType>, Operation[]>;
};

// Get the tokens symbol, decoded as a string
export const getTokenSymbol = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: Server,
) => {
  const contract = new Contract(tokenId);

  const tx = txBuilder
    .addOperation(contract.call("symbol"))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await simulateTx<string>(tx, decoders.bytesN, server);
  return result;
};

export const buildContractAuth = (
  authEntries: xdr.SorobanAuthorizationEntry[],
  signerKeypair: Keypair,
  networkPassphrase: string,
  contractID: string,
  server: Server,
) => {
  const signedAuthEntries = [];

  if (authEntries.length) {
    for (const entry of authEntries) {
      if (entry.credentials().switch().name === "sorobanCredentialsAddress") {
        const entryAddress = entry.credentials().address().address();

        if (
          signerKeypair.xdrPublicKey().toXDR("hex") ===
          entryAddress.toXDR("hex")
        ) {
          let nonce = "0";
          let expirationLedgerSeq = 0;

          const key = xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contract: xdr.ScAddress.scAddressTypeContract(
                Buffer.from(contractID),
              ),
              key: xdr.ScVal.scvLedgerKeyContractInstance(),
              durability: xdr.ContractDataDurability.persistent(),
              bodyType: xdr.ContractEntryBodyType.dataEntry(),
            }),
          );

          // Fetch the current contract nonce/ledger seq
          server.getLedgerEntries([key]).then((response) => {
            if (response.entries.length) {
              const parsed = xdr.LedgerEntryData.fromXDR(
                response.entries[0].xdr,
                "base64",
              );
              nonce = parsed.data().dataValue().toString();
              expirationLedgerSeq = parsed.contractData().expirationLedgerSeq();
            }
          });

          const passPhraseHash = hash(Buffer.from(networkPassphrase));
          const invocation = entry.rootInvocation();
          const hashIDPreimageEnvelope =
            new xdr.HashIdPreimageSorobanAuthorization({
              networkId: Buffer.from(passPhraseHash).subarray(0, 32),
              invocation,
              nonce: numberToU64(nonce),
              signatureExpirationLedger: expirationLedgerSeq,
            });

          const preimageHash = hash(hashIDPreimageEnvelope.toXDR("raw"));
          const signature = signerKeypair.sign(preimageHash);
          const authEntry = new xdr.SorobanAuthorizationEntry({
            credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
              new xdr.SorobanAddressCredentials({
                address: new Address(signerKeypair.publicKey()).toScAddress(),
                nonce: hashIDPreimageEnvelope.nonce(),
                signatureExpirationLedger:
                  hashIDPreimageEnvelope.signatureExpirationLedger(),
                signatureArgs: [
                  nativeToScVal({
                    public_key: signerKeypair.rawPublicKey(),
                    signature,
                  }),
                ],
              }),
            ),
            rootInvocation: invocation,
          });
          signedAuthEntries.push(authEntry);
        }
      }
    }
  }

  return signedAuthEntries;
};

export const signContractAuth = (
  contractID: string,
  signerKeypair: Keypair,
  tx: Transaction,
  server: Server,
  networkPassphrase: string,
) => {
  // rebuild tx and attach signed auth
  const source = new Account(tx.source, `${parseInt(tx.sequence, 10) - 1}`);
  const txnBuilder = new TransactionBuilder(source, {
    fee: tx.fee,
    networkPassphrase,
    timebounds: tx.timeBounds,
    ledgerbounds: tx.ledgerBounds,
    minAccountSequence: tx.minAccountSequence,
    minAccountSequenceAge: tx.minAccountSequenceAge,
    minAccountSequenceLedgerGap: tx.minAccountSequenceLedgerGap,
  });

  if (!tx.operations.length) {
    return txnBuilder.build();
  }

  // Soroban transaction can only have 1 operation
  const rawInvokeHostFunctionOp = tx
    .operations[0] as Operation.InvokeHostFunction;

  const auth = rawInvokeHostFunctionOp.auth ? rawInvokeHostFunctionOp.auth : [];
  const signedAuth = buildContractAuth(
    auth,
    signerKeypair,
    networkPassphrase,
    contractID,
    server,
  );

  txnBuilder.addOperation(
    Operation.invokeHostFunction({
      ...rawInvokeHostFunctionOp,
      auth: signedAuth,
    }),
  );

  return txnBuilder.build();
};

export const getArgsFromEnvelope = (
  envelopeXdr: string,
  networkPassphrase: string,
) => {
  const txEnvelope = TransactionBuilder.fromXDR(
    envelopeXdr,
    networkPassphrase,
  ) as Transaction<Memo<MemoType>, Operation.InvokeHostFunction[]>;

  // only one op per tx in Soroban
  const op = txEnvelope.operations[0].func;

  if (!op) {
    throw new Error(ERRORS.BAD_ENVELOPE);
  }

  const args = op.invokeContract();

  return {
    addressA: StrKey.encodeEd25519PublicKey(
      args[2].address().accountId().ed25519(),
    ),
    addressB: StrKey.encodeEd25519PublicKey(
      args[3].address().accountId().ed25519(),
    ),
    tokenA: args[4].address().contractId().toString("hex"),
    tokenB: args[5].address().contractId().toString("hex"),
    amountA: valueToI128String(args[6]),
    minBForA: valueToI128String(args[7]),
    amountB: valueToI128String(args[8]),
    minAForB: valueToI128String(args[9]),
  };
};

// Build and submits a transaction to the Soroban RPC
// Polls for non-pending state, returns result after status is updated
export const submitTx = async (
  signedXDR: string,
  networkPassphrase: string,
  server: Server,
) => {
  const tx = TransactionBuilder.fromXDR(signedXDR, networkPassphrase);

  const sendResponse = await server.sendTransaction(tx);

  if (sendResponse.errorResultXdr) {
    throw new Error(ERRORS.UNABLE_TO_SUBMIT_TX);
  }

  if (sendResponse.status === SendTxStatus.Pending) {
    let txResponse = await server.getTransaction(sendResponse.hash);

    // Poll this until the status is not "NOT_FOUND"
    while (txResponse.status === GetTxStatus.NotFound) {
      // See if the transaction is complete
      // eslint-disable-next-line no-await-in-loop
      txResponse = await server.getTransaction(sendResponse.hash);
      // Wait a second
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return txResponse.resultXdr!;
    // eslint-disable-next-line no-else-return
  } else {
    throw new Error(
      `Unabled to submit transaction, status: ${sendResponse.status}`,
    );
  }
};
