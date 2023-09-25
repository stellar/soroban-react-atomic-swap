import React, { ChangeEvent } from "react";
import {
  assembleTransaction,
  BASE_FEE,
  Memo,
  MemoType,
  Operation,
  SorobanDataBuilder,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from "soroban-client";
import {
  Button,
  Card,
  Icon,
  IconButton,
  Loader,
  Heading,
  Select,
  Input,
} from "@stellar/design-system";
import {
  WalletNetwork,
  WalletType,
  ISupportedWallet,
  StellarWalletsKit,
} from "stellar-wallets-kit";

import { bc, ChannelMessageType } from "../../helpers/channel";
import { copyContent } from "../../helpers/dom";
import { NetworkDetails, signTx } from "../../helpers/network";
import {
  getServer,
  submitTx,
  getTxBuilder,
  buildSwap,
  getTokenDecimals,
  parseTokenAmount,
} from "../../helpers/soroban";
import { ERRORS } from "../../helpers/error";

type StepCount = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface ExchangeProps {
  basePath: string;
  networkDetails: NetworkDetails;
  setError: (error: string | null) => void;
  setPubKey: (pubKey: string) => void;
  setTokenADecimals: React.Dispatch<React.SetStateAction<number>>;
  setTokenBDecimals: React.Dispatch<React.SetStateAction<number>>;
  swkKit: StellarWalletsKit;
  tokenADecimals: number;
  tokenBDecimals: number;
  pubKey: string;
}

export const Exchange = (props: ExchangeProps) => {
  const [contractID, setContractID] = React.useState("");
  const [signedTx, setSignedTx] = React.useState("");
  const [txResultXDR, setTxResultXDR] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [stepCount, setStepCount] = React.useState(1 as StepCount);

  const [tokenAAddress, setTokenAAddress] = React.useState("");
  const [amountA, setAmountA] = React.useState("");
  const [minAmountA, setMinAmountA] = React.useState("");
  const [tokenBAddress, setTokenBAddress] = React.useState("");
  const [amountB, setAmountB] = React.useState("");
  const [minAmountB, setMinAmountB] = React.useState("");
  const [swapperBAddress, setSwapperBAddress] = React.useState("");
  const [originalFootprint, setOriginalFootprint] = React.useState(
    null as xdr.LedgerFootprint | null,
  );
  const [fee, setFee] = React.useState(BASE_FEE);
  const [memo, setMemo] = React.useState("");

  bc.onmessage = (messageEvent) => {
    const { data, type } = messageEvent.data;

    switch (type) {
      case ChannelMessageType.SignedTx: {
        setSignedTx(data.signedTx);
        setStepCount(6);
        return;
      }
      default:
        console.log(`message type unknown, ignoring ${type}`);
    }
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
          props.setPubKey(publicKey);

          setStepCount((stepCount + 1) as StepCount);
        } catch (error) {
          console.log(error);
          props.setError(ERRORS.WALLET_CONNECTION_REJECTED);
        }
      },
    });
  };

  function renderStep(step: StepCount) {
    switch (step) {
      case 7: {
        return (
          <>
            <Heading as="h1" size="sm" addlClassName="title">
              Transaction Result
            </Heading>
            <div className="signed-xdr">
              <p className="detail-header">Result XDR</p>
              <Card variant="secondary">
                <div className="xdr-copy">
                  <IconButton
                    altText="copy result xdr data"
                    icon={<Icon.ContentCopy key="copy-icon" />}
                    onClick={() => copyContent(txResultXDR)}
                  />
                </div>
                <div className="xdr-data">{txResultXDR}</div>
              </Card>
            </div>
            <div className="submit-row-send">
              <Button
                size="md"
                variant="tertiary"
                isFullWidth
                onClick={() => setStepCount(1)}
              >
                Start Over
              </Button>
            </div>
          </>
        );
      }
      case 6: {
        const submit = async () => {
          const server = getServer(props.networkDetails);
          setIsSubmitting(true);

          const tx = TransactionBuilder.fromXDR(
            signedTx,
            props.networkDetails.networkPassphrase,
          ) as Transaction<Memo<MemoType>, Operation[]>;

          const txSim = await server.simulateTransaction(tx);

          if (!SorobanRpc.isSimulationSuccess(txSim)) {
            props.setError(ERRORS.TX_SIM_FAILED);
            return;
          }

          const preparedTransaction = assembleTransaction(
            tx,
            props.networkDetails.networkPassphrase,
            txSim,
          );

          if (originalFootprint) {
            const finalTx = preparedTransaction
              .setSorobanData(
                new SorobanDataBuilder(txSim.transactionData.build())
                  .setFootprint(
                    originalFootprint.readOnly(),
                    originalFootprint.readWrite(),
                  )
                  .build(),
              )
              .build();

            const _signedXdr = await signTx(
              finalTx.toXDR(),
              props.pubKey,
              props.swkKit,
            );

            try {
              const result = await submitTx(
                _signedXdr,
                props.networkDetails.networkPassphrase,
                server,
              );

              setIsSubmitting(false);
              if (!result) {
                props.setError(ERRORS.UNABLE_TO_SUBMIT_TX);
                return;
              }

              setTxResultXDR(result.toString());
              setStepCount((stepCount + 1) as StepCount);
            } catch (error) {
              console.log(error);
              setIsSubmitting(false);
              props.setError(ERRORS.UNABLE_TO_SUBMIT_TX);
            }
            return;
          }
          props.setError(ERRORS.BAD_ENVELOPE);
        };
        return (
          <>
            <Heading as="h1" size="sm">
              Submit Swap Transaction
            </Heading>
            <div className="signed-xdr">
              <p className="detail-header">Signed XDR</p>
              <Card variant="secondary">
                <div className="xdr-copy">
                  <IconButton
                    altText="copy signed xdr data"
                    icon={<Icon.ContentCopy key="copy-icon" />}
                    onClick={() => copyContent(signedTx)}
                  />
                </div>
                <div className="xdr-data">{signedTx}</div>
              </Card>
            </div>
            <div className="submit-row">
              <Button size="md" variant="tertiary" isFullWidth onClick={submit}>
                Sign with Wallet & Submit
                {isSubmitting && <Loader />}
              </Button>
            </div>
          </>
        );
      }
      case 5: {
        const handleFeeChange = (event: ChangeEvent<HTMLInputElement>) => {
          setFee(event.target.value);
        };
        const handleMemoChange = (event: ChangeEvent<HTMLInputElement>) => {
          setMemo(event.target.value);
        };

        const goToSwapperA = async () => {
          const server = getServer(props.networkDetails);
          // Gets a transaction builder and use it to add a "swap" operation and build the corresponding XDR
          const txBuilder = await getTxBuilder(
            props.pubKey,
            BASE_FEE,
            server,
            props.networkDetails.networkPassphrase,
          );

          const tokenA = {
            id: tokenAAddress,
            amount: parseTokenAmount(amountA, props.tokenADecimals).toString(),
            minAmount: parseTokenAmount(
              minAmountA,
              props.tokenADecimals,
            ).toString(),
          };

          const tokenB = {
            id: tokenBAddress,
            amount: parseTokenAmount(amountB, props.tokenBDecimals).toString(),
            minAmount: parseTokenAmount(
              minAmountB,
              props.tokenBDecimals,
            ).toString(),
          };

          const { preparedTransaction, footprint } = await buildSwap(
            contractID,
            tokenA,
            tokenB,
            props.pubKey,
            swapperBAddress,
            memo,
            server,
            props.networkDetails.networkPassphrase,
            txBuilder,
          );
          setOriginalFootprint(footprint);

          const newWindow = window.open(
            `${props.basePath}/swapper-a`,
            "_blank",
          );
          if (newWindow) {
            newWindow.onload = () => {
              bc.postMessage({
                type: ChannelMessageType.ContractID,
                data: {
                  baseTx: preparedTransaction
                    .build()
                    .toEnvelope()
                    .toXDR("base64"),
                  contractID,
                },
              });
            };
          }
        };

        return (
          <>
            <Heading as="h1" size="sm">
              Payment Settings
            </Heading>
            <Input
              fieldSize="md"
              id="input-fee"
              label="Estimated Fee (XLM)"
              value={fee}
              onChange={handleFeeChange}
            />
            <Input
              fieldSize="md"
              id="input-memo"
              label="Memo"
              value={memo}
              onChange={handleMemoChange}
            />
            <div className="submit-row-exchange">
              <Button
                size="md"
                variant="tertiary"
                isFullWidth
                onClick={goToSwapperA}
              >
                Build Swap
              </Button>
            </div>
          </>
        );
      }
      case 4: {
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

        const onClick = async () => {
          const server = getServer(props.networkDetails);
          const txBuilder = await getTxBuilder(
            props.pubKey,
            BASE_FEE,
            server,
            props.networkDetails.networkPassphrase,
          );
          const decimals = await getTokenDecimals(
            tokenBAddress,
            txBuilder,
            server,
          );
          props.setTokenBDecimals(decimals);
          setStepCount((stepCount + 1) as StepCount);
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
                onClick={onClick}
              >
                Next
              </Button>
            </div>
          </>
        );
      }
      case 3: {
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

        const onClick = async () => {
          const server = getServer(props.networkDetails);
          const txBuilder = await getTxBuilder(
            props.pubKey,
            BASE_FEE,
            server,
            props.networkDetails.networkPassphrase,
          );
          const decimals = await getTokenDecimals(
            tokenAAddress,
            txBuilder,
            server,
          );
          props.setTokenADecimals(decimals);
          setStepCount((stepCount + 1) as StepCount);
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
                onClick={onClick}
              >
                Next
              </Button>
            </div>
          </>
        );
      }
      case 2: {
        const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
          setContractID(event.target.value);
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
              Swap Tokens
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
            <div className="submit-row-exchange">
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
