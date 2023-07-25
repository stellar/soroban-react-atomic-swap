import React, { ChangeEvent } from "react";
import {
  Memo,
  MemoType,
  Operation,
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

import { bc, ChannelMessageType } from "helpers/channel";
import { copyContent } from "helpers/dom";
import { NetworkDetails, signTx } from "helpers/network";
import { getServer, submitTx } from "helpers/soroban";
import { ERRORS } from "../../helpers/error";

type StepCount = 1 | 2 | 3 | 4;

interface ExchangeProps {
  networkDetails: NetworkDetails;
  setError: (error: string | null) => void;
  setPubKey: (pubKey: string) => void;
  swkKit: StellarWalletsKit;
}

export const Exchange = (props: ExchangeProps) => {
  const [contractID, setContractID] = React.useState("");
  const [signedTx, setSignedTx] = React.useState("");
  const [txResultXDR, setTxResultXDR] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [stepCount, setStepCount] = React.useState(1 as StepCount);

  // TODO: refactor, keys should be kept local in all steps
  const [exchangeKey, setExchangeKey] = React.useState("");

  bc.onmessage = (messageEvent) => {
    const { data, type } = messageEvent.data;
    switch (type) {
      case ChannelMessageType.SignedTx: {
        setSignedTx(data.signedTx);
        setStepCount(3);
        return;
      }
      default:
        console.log("message type unknown");
    }
  };

  const connect = async () => {
    props.setError(null);

    // See https://github.com/Creit-Tech/Stellar-Wallets-Kit/tree/main for more options
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
          setExchangeKey(publicKey);

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
      case 4: {
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
      case 3: {
        const submit = async () => {
          const server = getServer(props.networkDetails);

          setIsSubmitting(true);

          const tx = TransactionBuilder.fromXDR(
            xdr.TransactionEnvelope.fromXDR(signedTx, "base64"),
            props.networkDetails.networkPassphrase,
          ) as Transaction<Memo<MemoType>, Operation[]>;
          const preparedTransaction = await server.prepareTransaction(
            tx,
            props.networkDetails.networkPassphrase,
          );
          const _signedXdr = await signTx(
            preparedTransaction.toXDR(),
            exchangeKey,
            props.swkKit,
          );

          try {
            const result = await submitTx(
              _signedXdr,
              props.networkDetails.networkPassphrase,
              server,
            );

            setTxResultXDR(result);
            setIsSubmitting(false);

            setStepCount((stepCount + 1) as StepCount);
          } catch (error) {
            console.log(error);
            setIsSubmitting(false);
            props.setError(ERRORS.UNABLE_TO_SUBMIT_TX);
          }
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
      case 2: {
        const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
          setContractID(event.target.value);
        };
        const goToSwapperA = () => {
          const newWindow = window.open(
            `${window.location.origin}/swapper-a`,
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
