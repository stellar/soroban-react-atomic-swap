import {
  Account,
  Address,
  Contract,
  Memo,
  MemoType,
  Operation,
  scValToNative,
  Server,
  SorobanRpc,
  StrKey,
  TimeoutInfinite,
  Transaction,
  TransactionBuilder,
  xdr,
  scValToBigInt,
  ScInt,
  assembleTransaction,
  Keypair,
  hash,
  nativeToScVal,
} from "soroban-client";
import BigNumber from "bignumber.js";
import { StellarWalletsKit } from "stellar-wallets-kit";

import { NetworkDetails, signData } from "./network";
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
  FUTURENET: "https://rpc-futurenet.stellar.org:443",
};

// Given a display value for a token and a number of decimals, return the corresponding BigNumber
export const parseTokenAmount = (value: string, decimals: number) => {
  const comps = value.split(".");

  let whole = comps[0];
  let fraction = comps[1];
  if (!whole) {
    whole = "0";
  }
  if (!fraction) {
    fraction = "0";
  }

  // Trim trailing zeros
  while (fraction[fraction.length - 1] === "0") {
    fraction = fraction.substring(0, fraction.length - 1);
  }

  // If decimals is 0, we have an empty string for fraction
  if (fraction === "") {
    fraction = "0";
  }

  // Fully pad the string with zeros to get to value
  while (fraction.length < decimals) {
    fraction += "0";
  }

  const wholeValue = new BigNumber(whole);
  const fractionValue = new BigNumber(fraction);

  return wholeValue.shiftedBy(decimals).plus(fractionValue);
};

export const accountToScVal = (account: string) =>
  new Address(account).toScVal();

export const valueToI128String = (value: xdr.ScVal) =>
  scValToBigInt(value).toString();

// Get a server configfured for a specific network
export const getServer = (networkDetails: NetworkDetails) =>
  new Server(RPC_URLS[networkDetails.network], {
    allowHttp: networkDetails.networkUrl.startsWith("http://"),
  });

//  Can be used whenever we need to perform a "read-only" operation
//  Used in getTokenSymbol, getTokenName, and getTokenDecimals
export const simulateTx = async <ArgType>(
  tx: Transaction<Memo<MemoType>, Operation[]>,
  server: Server,
): Promise<ArgType> => {
  const { results } = await server.simulateTransaction(tx);

  if (!results || results.length !== 1) {
    throw new Error("Invalid response from simulateTransaction");
  }
  const result = results[0];
  const scVal = xdr.ScVal.fromXDR(result.xdr, "base64");
  let convertedScVal: any;
  try {
    // handle a case where scValToNative doesn't properly handle scvString
    convertedScVal = scVal.str().toString();
    return convertedScVal;
  } catch (e) {
    console.log(e);
  }
  return scValToNative(scVal);
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

  const result = await simulateTx<number>(tx, server);
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
    amount: string;
    minAmount: string;
  },
  tokenB: {
    id: string;
    amount: string;
    minAmount: string;
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
          new ScInt(tokenA.amount).toI128(),
          new ScInt(tokenA.minAmount).toI128(),
          new ScInt(tokenB.amount).toI128(),
          new ScInt(tokenB.minAmount).toI128(),
        ],
      ),
    )
    .setTimeout(TimeoutInfinite);

  if (memo.length > 0) {
    tx.addMemo(Memo.text(memo));
  }

  const built = tx.build();
  const sim = await server.simulateTransaction(built);
  const preparedTransaction = assembleTransaction(
    built,
    networkPassphrase,
    sim,
  ) as Transaction<Memo<MemoType>, Operation[]>;

  const sorobanTxData = xdr.SorobanTransactionData.fromXDR(
    sim.transactionData,
    "base64",
  );

  return {
    preparedTransaction,
    footprint: sorobanTxData.resources().footprint().toXDR("base64"),
  };
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

  const result = await simulateTx<string>(tx, server);
  return result;
};

export const buildContractAuth = async (
  authEntries: xdr.SorobanAuthorizationEntry[],
  signerPubKey: string,
  networkPassphrase: string,
  contractID: string,
  server: Server,
  kit: StellarWalletsKit,
) => {
  const signedAuthEntries = [];

  for (const entry of authEntries) {
    if (
      entry.credentials().switch() !==
      xdr.SorobanCredentialsType.sorobanCredentialsAddress()
    ) {
      signedAuthEntries.push(entry);
    } else {
      const entryAddress = entry.credentials().address().address().accountId();

      if (
        signerPubKey === StrKey.encodeEd25519PublicKey(entryAddress.ed25519())
      ) {
        let expirationLedgerSeq = 0;

        const key = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(contractID).toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent(),
            bodyType: xdr.ContractEntryBodyType.dataEntry(),
          }),
        );

        // Fetch the current contract ledger seq
        // eslint-disable-next-line no-await-in-loop
        const entryRes = await server.getLedgerEntries([key]);
        if (entryRes.entries && entryRes.entries.length) {
          const parsed = xdr.LedgerEntryData.fromXDR(
            entryRes.entries[0].xdr,
            "base64",
          );
          expirationLedgerSeq = parsed.contractData().expirationLedgerSeq();
        } else {
          throw new Error(ERRORS.CANNOT_FETCH_LEDGER_ENTRY);
        }

        const invocation = entry.rootInvocation();
        const signingMethod = async (input: Buffer) => {
          // eslint-disable-next-line no-await-in-loop
          const signature = (await signData(
            input.toString("base64"),
            signerPubKey,
            kit,
          )) as any as { data: number[] };
          return Buffer.from(signature.data);
        };

        // eslint-disable-next-line no-await-in-loop
        // const authEntry = await authorizeInvocationCallback(
        //   signerPubKey,
        //   signingMethod as any as (input: Buffer) => Buffer, // TODO: types in stellar-base not correct?
        //   networkPassphrase, // does this need to be passphrase hash?
        //   expirationLedgerSeq,
        //   invocation
        // )
        const entryNonce = entry.credentials().address().nonce();
        const preimage = buildAuthEnvelope(
          networkPassphrase,
          expirationLedgerSeq,
          invocation,
          entryNonce,
        );
        const input = hash(preimage.toXDR());
        // eslint-disable-next-line no-await-in-loop
        const signature = await signingMethod(input);
        const authEntry = buildAuthEntry(preimage, signature, signerPubKey);

        signedAuthEntries.push(authEntry);
      } else {
        signedAuthEntries.push(entry);
      }
    }
  }

  return signedAuthEntries;
};

function buildAuthEnvelope(
  networkPassphrase: string,
  validUntil: any,
  invocation: any,
  nonce: any,
) {
  const networkId = hash(Buffer.from(networkPassphrase));
  const envelope = new xdr.HashIdPreimageSorobanAuthorization({
    networkId,
    invocation,
    nonce,
    signatureExpirationLedger: validUntil,
  });

  return xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(envelope);
}

function buildAuthEntry(envelope: any, signature: any, publicKey: string) {
  // ensure this identity signed this envelope correctly
  if (
    !Keypair.fromPublicKey(publicKey).verify(hash(envelope.toXDR()), signature)
  ) {
    throw new Error(`signature does not match envelope or identity`);
  }

  if (
    envelope.switch() !== xdr.EnvelopeType.envelopeTypeSorobanAuthorization()
  ) {
    throw new TypeError(
      `expected sorobanAuthorization envelope, got ${envelope.switch().name}`,
    );
  }

  const auth = envelope.sorobanAuthorization();
  return new xdr.SorobanAuthorizationEntry({
    rootInvocation: auth.invocation(),
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(publicKey).toScAddress(),
        nonce: auth.nonce(),
        signatureExpirationLedger: auth.signatureExpirationLedger(),
        signatureArgs: [
          nativeToScVal(
            {
              public_key: StrKey.decodeEd25519PublicKey(publicKey),
              signature,
            },
            // force conversion of map keys to ScSymbol as this is expected by
            // custom [contracttype] Rust structures
            {
              type: {
                public_key: ["symbol", null],
                signature: ["symbol", null],
              },
            } as any,
          ),
        ],
      }),
    ),
  });
}

export const signContractAuth = async (
  contractID: string,
  signerPubKey: string,
  tx: Transaction,
  server: Server,
  networkPassphrase: string,
  kit: StellarWalletsKit,
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

  // Soroban transaction can only have 1 operation
  const rawInvokeHostFunctionOp = tx
    .operations[0] as Operation.InvokeHostFunction;

  const auth = rawInvokeHostFunctionOp.auth ? rawInvokeHostFunctionOp.auth : [];
  const signedAuth = await buildContractAuth(
    auth,
    signerPubKey,
    networkPassphrase,
    contractID,
    server,
    kit,
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
  const tokenA = StrKey.encodeContract(args[4].address().contractId());
  const tokenB = StrKey.encodeContract(args[5].address().contractId());

  return {
    addressA: StrKey.encodeEd25519PublicKey(
      args[2].address().accountId().ed25519(),
    ),
    addressB: StrKey.encodeEd25519PublicKey(
      args[3].address().accountId().ed25519(),
    ),
    tokenA,
    tokenB,
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
