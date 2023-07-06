import React from "react";
import { Button, Heading, Select } from "@stellar/design-system";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { bc, ChannelMessageType } from "helpers/channel";
import { NetworkDetails } from "helpers/network";
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

  console.log(signedTx);

  function renderStep(stepCount: SwapperBStepCount) {
    switch (stepCount) {
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
