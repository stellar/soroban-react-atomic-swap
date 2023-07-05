import React from "react";
import { Button, Heading, Select } from "@stellar/design-system";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { bc, ChannelMessageType } from "helpers/channel";
import { ERRORS } from "../../helpers/error";

export type SwapperAStepCount = 1 | 2 | 3 | 4 | 5;

interface SwapperAProps {
  pubKey: string | null;
  selectedNetwork: string;
  setError: (error: string | null) => void;
  setPubKey: (pubKey: string) => void;
  setStepCount: (step: SwapperAStepCount) => void;
  stepCount: SwapperAStepCount;
  swkKit: StellarWalletsKit;
}

export const SwapperA = (props: SwapperAProps) => {
  const text = props.pubKey ? "Next" : "Connect Wallet";
  const [contractID, setContractID] = React.useState("");
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
      props.setStepCount((props.stepCount + 1) as SwapperAStepCount);
    }
  };

  bc.onmessage = (messageEvent) => {
    const { data, type } = messageEvent.data;
    switch (type) {
      case ChannelMessageType.ContractID: {
        setContractID(data);
        return;
      }
      default:
        console.log("message type unknown");
    }
  };

  console.log(contractID);

  return (
    <>
      <Heading as="h1" size="sm">
        Choose Address A
      </Heading>
      <Select
        disabled
        fieldSize="md"
        id="selected-network"
        label="Select your Network"
        value={props.selectedNetwork}
      >
        <option>{props.selectedNetwork}</option>
      </Select>
      <div className="submit-row">
        <Button size="md" variant="tertiary" isFullWidth onClick={connect}>
          {text}
        </Button>
      </div>
    </>
  );
};
