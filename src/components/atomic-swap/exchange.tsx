import React, { ChangeEvent } from "react";
import { Button, Heading, Select, Input } from "@stellar/design-system";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { bc, ChannelMessageType } from "helpers/channel";
import { ERRORS } from "../../helpers/error";

export type ExchangeStepCount = 1 | 2;

interface ExchangeProps {
  pubKey: string | null;
  selectedNetwork: string;
  setError: (error: string | null) => void;
  setPubKey: (pubKey: string) => void;
  setStepCount: (step: ExchangeStepCount) => void;
  stepCount: ExchangeStepCount;
  swkKit: StellarWalletsKit;
}

export const Exchange = (props: ExchangeProps) => {
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
      props.setStepCount((props.stepCount + 1) as ExchangeStepCount);
    }
  };

  function renderStep(step: ExchangeStepCount) {
    switch (step) {
      case 2: {
        const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
          setContractID(event.target.value);
        };
        const goToSwapperA = () => {
          const newWindow = window.open(
            `${window.location.href}swapper-a`,
            "_blank",
          );
          if (newWindow) {
            newWindow.onload = () => {
              bc.postMessage({
                type: ChannelMessageType.ContractID,
                data: contractID,
              });
            };
          }
        };
        return (
          <>
            <Heading as="h1" size="sm">
              Swap Transaction Settings
            </Heading>
            <Input
              fieldSize="md"
              id="contract-id"
              label="Contract ID"
              value={contractID}
              onChange={handleChange}
            />
            <div className="submit-row">
              <Button
                size="md"
                variant="tertiary"
                isFullWidth
                onClick={goToSwapperA}
              >
                Go to Swapper A
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
              Swap Tokens
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
