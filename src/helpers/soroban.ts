import {
  assembleTransaction as sorobanAssemble,
  Account,
  Address,
  Contract,
  FeeBumpTransaction,
  hash,
  Keypair,
  Memo,
  MemoType,
  nativeToScVal,
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
} from "soroban-client";
import { StellarWalletsKit } from "stellar-wallets-kit";

import { NetworkDetails, signTx } from "./network";
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
  const preparedTransaction = sorobanAssemble(
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

  if (authEntries.length) {
    for (const entry of authEntries) {
      if (entry.credentials().switch().name === "sorobanCredentialsAddress") {
        const entryAddress = entry
          .credentials()
          .address()
          .address()
          .accountId();
        const entryNonce = entry.credentials().address().nonce();
        const signerKeyPair = Keypair.fromPublicKey(signerPubKey);

        if (
          signerKeyPair.xdrPublicKey().toXDR("hex") ===
          entryAddress.toXDR("hex")
        ) {
          let expirationLedgerSeq = 0;

          const key = xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contract: new Contract(contractID).address().toScAddress(),
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
          }

          const passPhraseHash = hash(Buffer.from(networkPassphrase));
          const invocation = entry.rootInvocation();
          const hashIDPreimageAuth = new xdr.HashIdPreimageSorobanAuthorization(
            {
              networkId: Buffer.from(passPhraseHash).subarray(0, 32),
              invocation,
              nonce: entryNonce,
              signatureExpirationLedger: expirationLedgerSeq,
            },
          );

          const preimage =
            xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
              hashIDPreimageAuth,
            );
          const preimageHash = hash(preimage.toXDR("raw"));

          // eslint-disable-next-line no-await-in-loop
          const signature = (await signTx(
            preimageHash.toString("base64"),
            signerPubKey,
            kit,
          )) as any as { data: number[] }; // not a string in this instance

          const authEntry = new xdr.SorobanAuthorizationEntry({
            credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
              new xdr.SorobanAddressCredentials({
                address: new Address(signerPubKey).toScAddress(),
                nonce: hashIDPreimageAuth.nonce(),
                signatureExpirationLedger:
                  hashIDPreimageAuth.signatureExpirationLedger(),
                signatureArgs: [
                  nativeToScVal(
                    {
                      public_key: StrKey.decodeEd25519PublicKey(signerPubKey),
                      signature: new Uint8Array(signature.data),
                    },
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
            rootInvocation: invocation,
          });
          signedAuthEntries.push(authEntry);
        } else {
          signedAuthEntries.push(entry);
        }
      } else {
        signedAuthEntries.push(entry);
      }
    }
  }

  return signedAuthEntries;
};

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

  if (!tx.operations.length) {
    return txnBuilder.build();
  }

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

function isSorobanTransaction(tx: Transaction): boolean {
  if (tx.operations.length !== 1) {
    return false;
  }

  switch (tx.operations[0].type) {
    case "invokeHostFunction":
    case "bumpFootprintExpiration":
    case "restoreFootprint":
      return true;

    default:
      return false;
  }
}

export const assembleTransaction = (
  raw: Transaction | FeeBumpTransaction,
  networkPassphrase: string,
  simulation: SorobanRpc.SimulateTransactionResponse,
  footprint: any,
): Transaction<Memo<MemoType>, Operation[]> => {
  if ("innerTransaction" in raw) {
    return assembleTransaction(
      raw.innerTransaction,
      networkPassphrase,
      simulation,
      footprint,
    );
  }

  if (!isSorobanTransaction(raw)) {
    throw new TypeError(
      "unsupported transaction: must contain exactly one " +
        "invokeHostFunction, bumpFootprintExpiration, or restoreFootprint " +
        "operation",
    );
  }

  if (simulation.results.length !== 1) {
    throw new Error(`simulation results invalid: ${simulation.results}`);
  }

  const source = new Account(raw.source, `${parseInt(raw.sequence, 10) - 1}`);
  const classicFeeNum = parseInt(raw.fee, 10) || 0;
  const minResourceFeeNum = parseInt(simulation.minResourceFee, 10) || 0;
  const txnBuilder = new TransactionBuilder(source, {
    // automatically update the tx fee that will be set on the resulting tx to
    // the sum of 'classic' fee provided from incoming tx.fee and minResourceFee
    // provided by simulation.
    //
    // 'classic' tx fees are measured as the product of tx.fee * 'number of
    // operations', In soroban contract tx, there can only be single operation
    // in the tx, so can make simplification of total classic fees for the
    // soroban transaction will be equal to incoming tx.fee + minResourceFee.
    fee: (classicFeeNum + minResourceFeeNum).toString(),
    memo: raw.memo,
    networkPassphrase,
    timebounds: raw.timeBounds,
    ledgerbounds: raw.ledgerBounds,
    minAccountSequence: raw.minAccountSequence,
    minAccountSequenceAge: raw.minAccountSequenceAge,
    minAccountSequenceLedgerGap: raw.minAccountSequenceLedgerGap,
    extraSigners: raw.extraSigners,
  });

  switch (raw.operations[0].type) {
    case "invokeHostFunction":
      {
        const invokeOp: Operation.InvokeHostFunction = raw.operations[0];
        const existingAuth = invokeOp.auth ?? [];
        txnBuilder.addOperation(
          Operation.invokeHostFunction({
            source: invokeOp.source,
            func: invokeOp.func,
            // apply the auth from the simulation
            auth:
              existingAuth.length > 0
                ? existingAuth
                : simulation.results[0].auth?.map((a) =>
                    xdr.SorobanAuthorizationEntry.fromXDR(a, "base64"),
                  ) ?? [],
          }),
        );
      }
      break;

    case "bumpFootprintExpiration":
      txnBuilder.addOperation(
        Operation.bumpFootprintExpiration(raw.operations[0]),
      );
      break;

    case "restoreFootprint":
      txnBuilder.addOperation(Operation.restoreFootprint(raw.operations[0]));
      break;
    default:
      throw new Error(`op not supported: ${raw.operations[0].type}`);
  }

  // apply the pre-built Soroban Tx Data from simulation onto the Tx
  const sorobanTxData = xdr.SorobanTransactionData.fromXDR(
    simulation.transactionData,
    "base64",
  );
  sorobanTxData.resources().footprint(footprint);
  txnBuilder.setSorobanData(sorobanTxData);

  return txnBuilder.build();
};
