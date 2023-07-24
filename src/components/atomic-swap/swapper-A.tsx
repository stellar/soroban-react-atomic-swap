import React, { ChangeEvent } from "react";
import {
  Button,
  Heading,
  Select,
  Input,
  Profile,
} from "@stellar/design-system";
import BigNumber from "bignumber.js";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { bc, ChannelMessageType } from "helpers/channel";
import {
  getServer,
  getTxBuilder,
  BASE_FEE,
  buildSwap,
  signContractAuth,
} from "helpers/soroban";
import { NetworkDetails } from "helpers/network";
import { ERRORS } from "../../helpers/error";

type StepCount = 1 | 2 | 3 | 4;

interface SwapperAProps {
  networkDetails: NetworkDetails;
  setError: (error: string | null) => void;
  setPubKey: (pubKey: string) => void;
  swkKit: StellarWalletsKit;
}

export const SwapperA = (props: SwapperAProps) => {
  const [pubKey, setPubKey] = React.useState("");
  const [contractID, setContractID] = React.useState("");
  const [tokenAAddress, setTokenAAddress] = React.useState("");
  const [amountA, setAmountA] = React.useState("");
  const [minAmountA, setMinAmountA] = React.useState("");
  const [tokenBAddress, setTokenBAddress] = React.useState("");
  const [amountB, setAmountB] = React.useState("");
  const [minAmountB, setMinAmountB] = React.useState("");
  const [swapperBAddress, setSwapperBAddress] = React.useState("");
  const [stepCount, setStepCount] = React.useState(1 as StepCount);

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

          await props.swkKit.setNetwork(WalletNetwork.FUTURENET);

          // also set pubkey in parent to display active profile
          props.setPubKey(publicKey);
          setPubKey(publicKey);
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
        setContractID(data);
        return;
      }
      default:
        console.log("message type unknown");
    }
  };

  function renderStep(step: StepCount) {
    switch (step) {
      case 4: {
        const signWithWallet = async () => {
          const server = getServer(props.networkDetails);
          // Gets a transaction builder and use it to add a "swap" operation and build the corresponding XDR
          const txBuilder = await getTxBuilder(
            pubKey,
            BASE_FEE,
            server,
            props.networkDetails.networkPassphrase,
          );

          const tokenA = {
            id: tokenAAddress,
            amount: new BigNumber(amountA).toNumber(),
            minAmount: new BigNumber(minAmountA).toNumber(),
          };

          const tokenB = {
            id: tokenBAddress,
            amount: new BigNumber(amountB).toNumber(),
            minAmount: new BigNumber(minAmountB).toNumber(),
          };

          const swapTx = await buildSwap(
            contractID,
            tokenA,
            tokenB,
            pubKey,
            swapperBAddress,
            "", // memo will be set after rebuild on exchange submit
            server,
            props.networkDetails.network,
            txBuilder,
          );

          try {
            const signedTx = await signContractAuth(
              contractID,
              pubKey,
              swapTx,
              server,
              props.networkDetails.networkPassphrase,
              props.swkKit,
            );
            const newWindow = window.open(
              `${window.location.origin}/swapper-b`,
              "_blank",
            );
            if (newWindow) {
              newWindow.onload = () => {
                bc.postMessage({
                  type: ChannelMessageType.SignedTx,
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
              <div className="tx-detail-item address-b">
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
      case 3: {
        const handleSwapperBAddress = (
          event: ChangeEvent<HTMLInputElement>,
        ) => {
          setSwapperBAddress(event.target.value);
        };
        const handleTokenBChange = (event: ChangeEvent<HTMLInputElement>) => {
          setTokenBAddress(event.target.value);
        };
        const handleTokenBAmountChange = (
          event: ChangeEvent<HTMLInputElement>,
        ) => {
          setAmountB(event.target.value);
        };
        const handleTokenBMinAmountChange = (
          event: ChangeEvent<HTMLInputElement>,
        ) => {
          setMinAmountB(event.target.value);
        };

        return (
          <>
            <Heading as="h1" size="sm">
              Choose Token B
            </Heading>
            <Input
              fieldSize="md"
              id="swapper-b-address"
              label="Swapper B Address"
              value={swapperBAddress}
              onChange={handleSwapperBAddress}
            />
            <Input
              fieldSize="md"
              id="token-b-id"
              label="Token ID"
              value={tokenBAddress}
              onChange={handleTokenBChange}
            />
            <Input
              fieldSize="md"
              id="token-b-amount"
              label="Amount"
              value={amountB}
              onChange={handleTokenBAmountChange}
            />
            <Input
              fieldSize="md"
              id="token-b-min-amount"
              label="Min Amount"
              value={minAmountB}
              onChange={handleTokenBMinAmountChange}
            />
            <div className="submit-row">
              <Button
                size="md"
                variant="tertiary"
                isFullWidth
                onClick={() => setStepCount((stepCount + 1) as StepCount)}
              >
                Next
              </Button>
            </div>
          </>
        );
      }
      case 2: {
        const handleTokenAChange = (event: ChangeEvent<HTMLInputElement>) => {
          setTokenAAddress(event.target.value);
        };
        const handleTokenAAmountChange = (
          event: ChangeEvent<HTMLInputElement>,
        ) => {
          setAmountA(event.target.value);
        };
        const handleTokenAMinAmountChange = (
          event: ChangeEvent<HTMLInputElement>,
        ) => {
          setMinAmountA(event.target.value);
        };

        return (
          <>
            <Heading as="h1" size="sm">
              Choose Token A
            </Heading>
            <Input
              fieldSize="md"
              id="token-a-id"
              label="Token ID"
              value={tokenAAddress}
              onChange={handleTokenAChange}
            />
            <Input
              fieldSize="md"
              id="token-a-amount"
              label="Amount"
              value={amountA}
              onChange={handleTokenAAmountChange}
            />
            <Input
              fieldSize="md"
              id="token-a-min-amount"
              label="Min Amount"
              value={minAmountA}
              onChange={handleTokenAMinAmountChange}
            />
            <div className="submit-row">
              <Button
                size="md"
                variant="tertiary"
                isFullWidth
                onClick={() => setStepCount((stepCount + 1) as StepCount)}
              >
                Next
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
