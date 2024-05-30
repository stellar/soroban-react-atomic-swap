import {
  StellarWalletsKit,
  // IStellarWalletsKitSignParams,
} from "stellar-wallets-kit";

import { signAuthEntry } from "@stellar/freighter-api";

export interface NetworkDetails {
  network: string;
  networkUrl: string;
  networkPassphrase: string;
}

export const TESTNET_DETAILS = {
  network: "TESTNET",
  networkUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
};

export const signData = async (
  entryXdr: string,
  publicKey: string,
  kit: StellarWalletsKit,
) => {
  // TODO: go back to using kit once auth entry PR lands
  console.log(kit);
  const signedEntry = await signAuthEntry(entryXdr, {
    accountToSign: publicKey,
  });
  return signedEntry;
};

export const signTx = async (
  xdr: string,
  publicKey: string,
  kit: StellarWalletsKit,
) => {
  const { signedXDR } = await kit.sign({
    xdr,
    publicKey,
  });
  return signedXDR;
};
