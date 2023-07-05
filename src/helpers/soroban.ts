import {
  Address,
  Contract,
  Server,
  TransactionBuilder,
  TimeoutInfinite,
  Memo,
  xdr,
} from "soroban-client";
import BigNumber from "bignumber.js";

import { NetworkDetails } from "./network";

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
