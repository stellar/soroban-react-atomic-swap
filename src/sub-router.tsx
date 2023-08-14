import * as React from "react";
import { Route, Routes } from "react-router-dom";
import {
  StellarWalletsKit,
  WalletNetwork,
  WalletType,
} from "stellar-wallets-kit";

import { AtomicSwap } from "./components/atomic-swap";
import { Exchange } from "./components/atomic-swap/exchange";
import { SwapperA } from "./components/atomic-swap/swapper-A";
import { SwapperB } from "./components/atomic-swap/swapper-B";

import { FUTURENET_DETAILS } from "./helpers/network";

import "@stellar/design-system/build/styles.min.css";
import "./index.scss";
import "./components/atomic-swap/index.scss";

interface AppProps {
  basePath?: string;
  hasHeader?: boolean;
}

export const AppSubRouter = (props: AppProps) => {
  const basePath = props.basePath || window.location.origin;
  // This is only needed when this component is consumed by other components that display a different header
  const hasHeader = props.hasHeader === undefined ? true : props.hasHeader;

  // Default to Futurenet network, only supported network for now
  const [selectedNetwork] = React.useState(FUTURENET_DETAILS);

  // Initial state, empty states for token/transaction details
  const [activePubKey, setActivePubKey] = React.useState("");
  const [error, setError] = React.useState(null as string | null);
  const [tokenADecimals, setTokenADecimals] = React.useState(0);
  const [tokenBDecimals, setTokenBDecimals] = React.useState(0);

  // Setup swc, user will set the desired wallet on connect
  const [SWKKit] = React.useState(
    new StellarWalletsKit({
      network: selectedNetwork.networkPassphrase as WalletNetwork,
      selectedWallet: WalletType.FREIGHTER,
    }),
  );

  // Whenever the selected network changes, set the network on swc
  React.useEffect(() => {
    SWKKit.setNetwork(selectedNetwork.networkPassphrase as WalletNetwork);
  }, [selectedNetwork.networkPassphrase, SWKKit]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <AtomicSwap
            hasHeader={hasHeader}
            pubKey={activePubKey}
            error={error}
          />
        }
      >
        <Route
          index
          element={
            <Exchange
              basePath={basePath}
              networkDetails={selectedNetwork}
              setError={setError}
              setPubKey={setActivePubKey}
              setTokenADecimals={setTokenADecimals}
              setTokenBDecimals={setTokenBDecimals}
              tokenADecimals={tokenADecimals}
              tokenBDecimals={tokenBDecimals}
              swkKit={SWKKit}
              pubKey={activePubKey}
            />
          }
        />
        <Route
          path="swapper-a/"
          element={
            <SwapperA
              basePath={basePath}
              decimals={tokenADecimals}
              networkDetails={selectedNetwork}
              setError={setError}
              setPubKey={setActivePubKey}
              swkKit={SWKKit}
              pubKey={activePubKey}
            />
          }
        />
        <Route
          path="swapper-b/"
          element={
            <SwapperB
              decimals={tokenBDecimals}
              networkDetails={selectedNetwork}
              setError={setError}
              setPubKey={setActivePubKey}
              swkKit={SWKKit}
              pubKey={activePubKey}
            />
          }
        />
      </Route>
    </Routes>
  );
};
