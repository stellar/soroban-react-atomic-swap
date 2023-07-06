import React from "react";
import { Button, Heading, Select } from "@stellar/design-system";
import { TransactionBuilder } from "soroban-client";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { bc, ChannelMessageType } from "helpers/channel";
import { getServer } from "helpers/soroban";
import { NetworkDetails, signTx } from "helpers/network";
import { ERRORS } from "../../helpers/error";

export type SwapperBStepCount = 1 | 2 | 3;

interface SwapperBProps {
  pubKey: string | null;
  networkDetails: NetworkDetails;
  setError: (error: string | null) => void;
  setStepCount: (step: SwapperBStepCount) => void;
  setPubKey: (pubKey: string) => void;
  stepCount: SwapperBStepCount;
  swkKit: StellarWalletsKit;
}

export const SwapperB = (props: SwapperBProps) => {
  const [signedTx, setSignedTx] = React.useState("");
  const connect = async () => {
    props.setError(null);

    // See https://github.com/Creit-Tech/Stellar-Wallets-Kit/tree/main for more options
    if (!props.pubKey) {
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

            await props.swkKit.setNetwork(WalletNetwork.FUTURENET);
            props.setPubKey(publicKey);
          } catch (error) {
            console.log(error);
            props.setError(ERRORS.WALLET_CONNECTION_REJECTED);
          }
        },
      });
    } else {
      props.setStepCount((props.stepCount + 1) as SwapperBStepCount);
    }
  };

  bc.onmessage = (messageEvent) => {
    const { data, type } = messageEvent.data;
    switch (type) {
      case ChannelMessageType.SignedTx: {
        setSignedTx(data);
        return;
      }
      default:
        console.log("message type unknown");
    }
  };

  function renderStep(stepCount: SwapperBStepCount) {
    switch (stepCount) {
      case 2: {
        const signWithWallet = async () => {
          try {
            const server = getServer(props.networkDetails);
            const tx = TransactionBuilder.fromXDR(
              signedTx,
              props.networkDetails.networkPassphrase,
            );
            console.log(tx);
            const preparedTransaction = await server.prepareTransaction(
              tx,
              props.networkDetails.networkPassphrase,
            );

            // TODO: this should sign the contract auth, not the tx
            const signed = await signTx(
              preparedTransaction.toXDR(),
              props.pubKey!,
              props.swkKit,
            );
            bc.postMessage({
              type: ChannelMessageType.SignedTx,
              data: signed,
            });
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
            {/* <div className="tx-details">
              <div className="tx-detail-item">
                <p className="detail-header">Network</p>
                <p className="detail-value">{props.networkDetails.network}</p>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Address A</p>
                <div className="address-a-identicon">
                  <Profile isShort publicAddress={tokenAAddress} size="sm" />
                </div>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Amount A</p>
                <p className="detail-value">{amountA}</p>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Min Amount A</p>
                <p className="detail-value">{minAmountA}</p>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Address B</p>
                <div className="address-b-identicon">
                  <Profile isShort publicAddress={tokenBAddress} size="sm" />
                </div>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Amount B</p>
                <p className="detail-value">{amountB}</p>
              </div>
              <div className="tx-detail-item">
                <p className="detail-header">Min Amount B</p>
                <p className="detail-value">{minAmountB}</p>
              </div>
            </div> */}
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
        const text = props.pubKey ? "Next" : "Connect Wallet";
        return (
          <>
            <Heading as="h1" size="sm">
              Choose Address B
            </Heading>
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
                {text}
              </Button>
            </div>
          </>
        );
      }
    }
  }
  return renderStep(props.stepCount);
};
