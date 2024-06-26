import React from "react";
import BigNumber from "bignumber.js";
import {
  Memo,
  MemoType,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { Button, Heading, Select, Profile } from "@stellar/design-system";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { bc, ChannelMessageType } from "../../helpers/channel";
import {
  getServer,
  signContractAuth,
  getArgsFromEnvelope,
} from "../../helpers/soroban";
import { NetworkDetails } from "../../helpers/network";
import { ERRORS } from "../../helpers/error";
import { formatTokenAmount } from "../../helpers/format";

type StepCount = 1 | 2;

interface SwapperAProps {
  decimals: number;
  basePath: string;
  networkDetails: NetworkDetails;
  setError: (error: string | null) => void;
  setPubKey: (pubKey: string) => void;
  swkKit: StellarWalletsKit;
  pubKey: string;
}

export const SwapperA = (props: SwapperAProps) => {
  const [baseTx, setBaseTx] = React.useState(
    {} as Transaction<Memo<MemoType>, Operation[]>,
  );
  const [contractID, setContractID] = React.useState("");
  const [stepCount, setStepCount] = React.useState(1 as StepCount);
  const [swapArgs, setSwapArgs] = React.useState(
    {} as ReturnType<typeof getArgsFromEnvelope>,
  );

  const connect = async () => {
    props.setError(null);

    await props.swkKit.openModal({
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

          await props.swkKit.setNetwork(WalletNetwork.TESTNET);

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
      case ChannelMessageType.ContractID: {
        setContractID(data.contractID);
        const tx = TransactionBuilder.fromXDR(
          data.baseTx,
          props.networkDetails.networkPassphrase,
        ) as Transaction<Memo<MemoType>, Operation[]>;
        setBaseTx(tx);

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

        return;
      }
      default:
        console.log(`message type unknown, ignoring ${type}`);
    }
  };

  function renderStep(step: StepCount) {
    switch (step) {
      case 2: {
        const signWithWallet = async () => {
          const server = getServer(props.networkDetails);

          try {
            const signedTx = await signContractAuth(
              contractID,
              props.pubKey,
              baseTx,
              server,
              props.networkDetails.networkPassphrase,
              props.swkKit,
            );
            const newWindow = window.open(
              `${props.basePath}/swapper-b`,
              "_blank",
            );
            if (newWindow) {
              newWindow.onload = () => {
                bc.postMessage({
                  type: ChannelMessageType.BuiltTx,
                  data: {
                    contractID,
                    signedTx: signedTx.toEnvelope().toXDR("base64"),
                  },
                });
              };
            }
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
              <div className="tx-detail-item">
                <p className="detail-header">Network</p>
                <p className="detail-value">{props.networkDetails.network}</p>
              </div>
              <div className="tx-detail-item address-a">
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
                <p className="detail-value">{swapArgs.amountA}</p>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Min Amount A</p>
                <p className="detail-value">{swapArgs.minAForB}</p>
              </div>
              <div className="tx-detail-item address-b">
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
                <p className="detail-value">{swapArgs.amountB}</p>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Min Amount B</p>
                <p className="detail-value">{swapArgs.minBForA}</p>
              </div>
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
              Choose Address A
            </Heading>
            <p>
              When swapping tokens, you generally have two addresses involved.
            </p>
            <p>Connect an address that owns token A.</p>
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
