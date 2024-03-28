import {
  Address,
  StrKey,
  xdr,
  nativeToScVal,
  Keypair,
  hash,
} from "@stellar/stellar-sdk";

// This can be replaced with the same helper in the sdk when it lands
// https://github.com/stellar/js-stellar-base/pull/678

export async function authorizeEntry(
  entry: xdr.SorobanAuthorizationEntry,
  signer: (input: Buffer) => Promise<Buffer>,
  validUntilLedgerSeq: any,
  networkPassphrase: string,
) {
  // no-op
  if (
    entry.credentials().switch() !==
    xdr.SorobanCredentialsType.sorobanCredentialsAddress()
  ) {
    return entry;
  }

  const addrAuth = entry.credentials().address();
  addrAuth.signatureExpirationLedger(validUntilLedgerSeq);

  const networkId = hash(Buffer.from(networkPassphrase));
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId,
      nonce: addrAuth.nonce(),
      invocation: entry.rootInvocation(),
      signatureExpirationLedger: addrAuth.signatureExpirationLedger(),
    }),
  );

  const signature = await signer(preimage.toXDR());
  const publicKey = Address.fromScAddress(addrAuth.address()).toString();

  if (
    !Keypair.fromPublicKey(publicKey).verify(hash(preimage.toXDR()), signature)
  ) {
    throw new Error(`signature doesn't match payload`);
  }

  const sigScVal = nativeToScVal(
    {
      public_key: StrKey.decodeEd25519PublicKey(publicKey),
      signature,
    },
    {
      // force the keys to be interpreted as symbols (expected for
      // Soroban [contracttype]s)
      type: {
        public_key: ["symbol", null],
        signature: ["symbol", null],
      } as any,
    },
  );

  addrAuth.signature(xdr.ScVal.scvVec([sigScVal]));
  return entry;
}
