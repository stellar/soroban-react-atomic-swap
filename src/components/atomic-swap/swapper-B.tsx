import React from "react";
import BigNumber from "bignumber.js";
import { Button, Heading, Select, Profile } from "@stellar/design-system";
import {
  Transaction,
  TransactionBuilder,
  Memo,
  MemoType,
  Operation,
} from "soroban-client";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { NetworkDetails } from "../../helpers/network";
import { bc, ChannelMessageType } from "../../helpers/channel";
import {
  getArgsFromEnvelope,
  getServer,
  getTokenSymbol,
  getTxBuilder,
  signContractAuth,
  BASE_FEE,
} from "../../helpers/soroban";
import { ERRORS } from "../../helpers/error";
import { formatTokenAmount } from "../../helpers/format";

type StepCount = 1 | 2 | 3;

interface SwapperBProps {
  decimals: number;
  networkDetails: NetworkDetails;
  setError: (error: string | null) => void;
  setPubKey: (pubKey: string) => void;
  swkKit: StellarWalletsKit;
  pubKey: string;
}

export const SwapperB = (props: SwapperBProps) => {
  const [signedTx, setSignedTx] = React.useState("");
  const [contractID, setContractID] = React.useState("");
  const [swapArgs, setSwapArgs] = React.useState(
    {} as ReturnType<typeof getArgsFromEnvelope>,
  );
  const [tokenASymbol, setTokenASymbol] = React.useState("");
  const [tokenBSymbol, setTokenBSymbol] = React.useState("");
  const [stepCount, setStepCount] = React.useState(1 as StepCount);

  const signAuthEntry = async () => {
    props.setError(null);

    const server = getServer(props.networkDetails);
    const tx = TransactionBuilder.fromXDR(
      signedTx,
      props.networkDetails.networkPassphrase,
    ) as Transaction<Memo<MemoType>, Operation[]>;

    const auth = await signContractAuth(
      contractID,
      props.pubKey,
      tx,
      server,
      props.networkDetails.networkPassphrase,
      props.swkKit,
    );
    return auth.toEnvelope().toXDR("base64");
  };

  const connect = () => {
    props.setError(null);

    // See https://github.com/Creit-Tech/Stellar-Wallets-Kit/tree/main for more options
    props.swkKit.openModal({
      allowedWallets: [
        WalletType.ALBEDO,
        WalletType.FREIGHTER,
        WalletType.XBULL,
      ],
      onWalletSelected: async (option: ISupportedWallet) => {
        try {
          // Set selected wallet,  network, and public key
          props.swkKit.setWallet(option.type);
          const publicKey = await props.swkKit.getPublicKey();

          props.swkKit.setNetwork(WalletNetwork.FUTURENET);

          const server = getServer(props.networkDetails);
          const tx = TransactionBuilder.fromXDR(
            signedTx,
            props.networkDetails.networkPassphrase,
          ) as Transaction<Memo<MemoType>, Operation[]>;
          const args = getArgsFromEnvelope(
            tx.toEnvelope().toXDR("base64"),
            props.networkDetails.networkPassphrase,
          );
          const formattedArgs = {
            ...args,
            amountA: formatTokenAmount(
              new BigNumber(args.amountA),
              props.decimals,
            ),
            amountB: formatTokenAmount(
              new BigNumber(args.amountB),
              props.decimals,
            ),
            minAForB: formatTokenAmount(
              new BigNumber(args.minAForB),
              props.decimals,
            ),
            minBForA: formatTokenAmount(
              new BigNumber(args.minBForA),
              props.decimals,
            ),
          };
          setSwapArgs(formattedArgs);

          const tokenASymbolBuilder = await getTxBuilder(
            publicKey,
            BASE_FEE,
            server,
            props.networkDetails.networkPassphrase,
          );
          const symbolA = await getTokenSymbol(
            args.tokenA,
            tokenASymbolBuilder,
            server,
          );
          setTokenASymbol(symbolA);

          const tokenBSymbolBuilder = await getTxBuilder(
            publicKey,
            BASE_FEE,
            server,
            props.networkDetails.networkPassphrase,
          );
          const symbolB = await getTokenSymbol(
            args.tokenB,
            tokenBSymbolBuilder,
            server,
          );
          setTokenBSymbol(symbolB);

          props.setPubKey(publicKey);
          setStepCount((stepCount + 1) as StepCount);
        } catch (error) {
          console.log(error);
          props.setError(ERRORS.WALLET_CONNECTION_REJECTED);
        }
      },
    });
  };

  bc.onmessage = (messageEvent) => {
    const { data, type } = messageEvent.data;
    switch (type) {
      case ChannelMessageType.BuiltTx: {
        setSignedTx(data.signedTx);
        setContractID(data.contractID);
        return;
      }
      default:
        console.log(`message type unknown, ignoring ${type}`);
    }
  };

  function renderStep(step: StepCount) {
    switch (step) {
      case 3: {
        return (
          <>
            <Heading as="h1" size="sm">
              Authorized Successfully
            </Heading>
            <p>
              You can now close this window, the exchange will submit your swap.
            </p>
          </>
        );
      }
      case 2: {
        const signWithWallet = async () => {
          try {
            const _signedTx = await signAuthEntry();
            bc.postMessage({
              type: ChannelMessageType.SignedTx,
              data: {
                contractID,
                signedTx: _signedTx,
              },
            });

            setStepCount((stepCount + 1) as StepCount);
          } catch (e) {
            console.log("e: ", e);
            props.setError(ERRORS.UNABLE_TO_SIGN_TX);
          }
        };

        return (
          <>
            <Heading as="h1" size="sm">
              Confirm Swap Transaction
            </Heading>
            <div className="tx-details">
              {Object.keys(swapArgs).length > 0 && (
                <>
                  <div className="tx-detail-item">
                    <p className="detail-header">Network</p>
                    <p className="detail-value">
                      {props.networkDetails.network}
                    </p>
                  </div>
                  <div className="tx-detail-item">
                    <p className="detail-header">Address A</p>
                    <div className="address-a-identicon">
                      <Profile
                        isShort
                        publicAddress={swapArgs.addressA}
                        size="sm"
                      />
                    </div>
                  </div>
                  <div className="tx-detail-item">
                    <p className="detail-header">Amount A</p>
                    <p className="detail-value">
                      {swapArgs.amountA} {tokenASymbol}
                    </p>
                  </div>
                  <div className="tx-detail-item">
                    <p className="detail-header">Min Amount A</p>
                    <p className="detail-value">
                      {swapArgs.minAForB} {tokenASymbol}
                    </p>
                  </div>
                  <div className="tx-detail-item">
                    <p className="detail-header">Address B</p>
                    <div className="address-b-identicon">
                      <Profile
                        isShort
                        publicAddress={swapArgs.addressB}
                        size="sm"
                      />
                    </div>
                  </div>
                  <div className="tx-detail-item">
                    <p className="detail-header">Amount B</p>
                    <p className="detail-value">
                      {swapArgs.amountB} {tokenBSymbol}
                    </p>
                  </div>
                  <div className="tx-detail-item">
                    <p className="detail-header">Min Amount B</p>
                    <p className="detail-value">
                      {swapArgs.minBForA} {tokenBSymbol}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="submit-row">
              <Button
                size="md"
                variant="tertiary"
                isFullWidth
                onClick={signWithWallet}
              >
                Sign with Wallet
              </Button>
            </div>
          </>
        );
      }
      case 1:
      default: {
        return (
          <>
            <Heading as="h1" size="sm">
              Choose Address B
            </Heading>
            <p>
              Now, in your wallet, switch to another address that owns Token B.
            </p>
            <Select
              disabled
              fieldSize="md"
              id="selected-network"
              label="Select your Network"
              value={props.networkDetails.network}
            >
              <option>{props.networkDetails.network}</option>
            </Select>
            <div className="submit-row">
              <Button
                size="md"
                variant="tertiary"
                isFullWidth
                onClick={connect}
              >
                Connect Wallet
              </Button>
            </div>
          </>
        );
      }
    }
  }
  return renderStep(stepCount);
};
