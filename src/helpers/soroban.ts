import {
  Address,
  Contract,
  Server,
  TransactionBuilder,
  TimeoutInfinite,
  Memo,
  xdr,
  Transaction,
  Operation,
  Keypair,
} from "soroban-client";
import BigNumber from "bignumber.js";

import { NetworkDetails } from "./network";

export const BASE_FEE = "100";

export const RPC_URLS: { [key: string]: string } = {
  FUTURENET: "https://rpc-futurenet.stellar.org/",
};

export const sha256 = async (message: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return hash;
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

  const hi = new xdr.Int64(
    bigNumberFromBytes(false, ...padded.slice(4, 8)).toNumber(),
    bigNumberFromBytes(false, ...padded.slice(0, 4)).toNumber(),
  );
  const lo = new xdr.Uint64(
    bigNumberFromBytes(false, ...padded.slice(12, 16)).toNumber(),
    bigNumberFromBytes(false, ...padded.slice(8, 12)).toNumber(),
  );

  return xdr.ScVal.scvI128(new xdr.Int128Parts({ lo, hi }));
};

const numberToU64 = (value: string) => {
  const bigi = BigInt(value);
  return new xdr.Uint64(
    Number(BigInt.asUintN(32, bigi)),
    Number(BigInt.asUintN(64, bigi) >> 32n),
  );
};

// Get a server configfured for a specific network
export const getServer = (networkDetails: NetworkDetails) =>
  new Server(RPC_URLS[networkDetails.network], {
    allowHttp: networkDetails.networkUrl.startsWith("http://"),
  });

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
          contractA.address().toScVal(),
          contractB.address().toScVal(),
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

  // TODO: add auth stuff after p10 lands

  const preparedTransaction = await server.prepareTransaction(
    tx.build(),
    networkPassphrase,
  );

  return preparedTransaction.toXDR();
};

export const buildContractAuth = async (
  auths: string[],
  signerKeypair: Keypair,
  networkPassphrase: string,
  contractID: string,
  server: Server,
) => {
  const contractAuths = [];

  if (auths) {
    for (const authStr of auths) {
      const contractAuth = xdr.ContractAuth.fromXDR(authStr, "base64");

      if (contractAuth.addressWithNonce()) {
        const authAccount = contractAuth
          .addressWithNonce()!
          .address()
          .accountId()
          .toXDR("hex");

        if (signerKeypair.xdrPublicKey().toXDR("hex") === authAccount) {
          let nonce = "0";

          const key = xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contractId: Buffer.from(contractID).subarray(0, 32),
              key: xdr.ScVal.scvLedgerKeyNonce(
                new xdr.ScNonceKey({
                  nonceAddress: xdr.ScAddress.scAddressTypeContract(
                    Buffer.from(signerKeypair.publicKey()).subarray(0, 32),
                  ),
                }),
              ),
            }),
          );

          // Fetch the current contract nonce
          server.getLedgerEntries([key]).then((response) => {
            if (response.entries && response.entries.length) {
              const ledgerEntry = response.entries[0];
              const parsed = xdr.LedgerEntryData.fromXDR(
                ledgerEntry.xdr,
                "base64",
              );
              nonce = parsed.data().dataValue().toString();
            }
          });

          // eslint-disable-next-line no-await-in-loop
          const passPhraseHash = await sha256(networkPassphrase);
          const hashIDPreimageEnvelope =
            xdr.HashIdPreimage.envelopeTypeContractAuth(
              new xdr.HashIdPreimageContractAuth({
                networkId: Buffer.from(passPhraseHash).subarray(0, 32),
                nonce: numberToU64(nonce),
                invocation: contractAuth.rootInvocation(),
              }),
            ).toXDR("raw");

          // eslint-disable-next-line no-await-in-loop
          const preimageHash = await sha256(hashIDPreimageEnvelope.toString());
          const signature = signerKeypair.sign(Buffer.from(preimageHash));
          // Need to double wrap with vec because of a preview 9 bug, fixed in preview 10
          const sigBAccountSig = xdr.ScVal.scvVec([
            xdr.ScVal.scvVec([
              xdr.ScVal.scvMap([
                new xdr.ScMapEntry({
                  key: xdr.ScVal.scvSymbol("public_key"),
                  val: xdr.ScVal.scvBytes(signerKeypair.rawPublicKey()),
                }),
                new xdr.ScMapEntry({
                  key: xdr.ScVal.scvSymbol("signature"),
                  val: xdr.ScVal.scvBytes(Buffer.from(signature)),
                }),
              ]),
            ]),
          ]);
          contractAuth.signatureArgs([sigBAccountSig]);
        }
      }
      contractAuths.push(contractAuth);
    }
  }

  return contractAuths;
};

export const signContractAuth = async (
  contractID: string,
  signerKeypair: Keypair,
  tx: Transaction,
  server: Server,
  networkPassphrase: string,
) => {
  const simulation = await server.simulateTransaction(tx);

  // Soroban transaction can only have 1 operation
  const rawInvokeHostFunctionOp = tx
    .operations[0] as Operation.InvokeHostFunction;

  const authDecoratedHostFunctions = await Promise.all(
    simulation.results.map(async (functionSimulationResult, i) => {
      const hostFn = rawInvokeHostFunctionOp.functions[i];
      const signedAuth = await buildContractAuth(
        functionSimulationResult.auth,
        signerKeypair,
        networkPassphrase,
        contractID,
        server,
      );
      hostFn.auth(signedAuth);
      return hostFn;
    }),
  );

  return authDecoratedHostFunctions;
};
