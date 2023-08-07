import {
  StellarWalletsKit,
  IStellarWalletsKitSignParams,
} from "stellar-wallets-kit";

export interface NetworkDetails {
  network: string;
  networkUrl: string;
  networkPassphrase: string;
}

// Soroban is only supported on Futurenet right now
export const FUTURENET_DETAILS = {
  network: "FUTURENET",
  networkUrl: "https://horizon-futurenet.stellar.org",
  networkPassphrase: "Test SDF Future Network ; October 2022",
};

export const signData = async (
  blob: string,
  publicKey: string,
  kit: StellarWalletsKit,
) => {
  const { signedXDR } = await kit.sign({
    blob,
    publicKey,
  } as any as IStellarWalletsKitSignParams);
  return signedXDR;
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
