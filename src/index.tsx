import * as React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import {
  StellarWalletsKit,
  WalletNetwork,
  WalletType,
} from "stellar-wallets-kit";

import { AtomicSwap } from "components/atomic-swap";
import { Exchange, ExchangeStepCount } from "./components/atomic-swap/exchange";
import { SwapperA } from "./components/atomic-swap/swapper-A";
import { SwapperB } from "./components/atomic-swap/swapper-B";

import { FUTURENET_DETAILS } from "./helpers/network";

import "@stellar/design-system/build/styles.min.css";
import "./index.scss";

interface AppProps {
  hasHeader?: boolean;
}

const App = (props: AppProps) => {
  // This is only needed when this component is consumed by other components that display a different header
  const hasHeader = props.hasHeader === undefined ? true : props.hasHeader;

  // Default to Futurenet network, only supported network for now
  const [selectedNetwork] = React.useState(FUTURENET_DETAILS);

  // Initial state, empty states for token/transaction details
  const [activePubKey, setActivePubKey] = React.useState(null as string | null);
  const [error, setError] = React.useState(null as string | null);
  const [exchangeStepCount, setExchangeStepCount] = React.useState(
    1 as ExchangeStepCount,
  );
  const [contractID, setContractID] = React.useState("");

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

  const router = createBrowserRouter([
    {
      path: "/",
      element: (
        <AtomicSwap hasHeader={hasHeader} pubKey={activePubKey} error={error} />
      ),
      errorElement: <div>404!</div>,
      children: [
        {
          index: true,
          element: (
            <Exchange
              contractID={contractID}
              pubKey={activePubKey}
              selectedNetwork={selectedNetwork.network}
              setContractID={setContractID}
              setError={setError}
              setPubKey={setActivePubKey}
              setStepCount={setExchangeStepCount}
              stepCount={exchangeStepCount}
              swkKit={SWKKit}
            />
          ),
        },
        {
          path: "swapper-a/",
          element: <SwapperA />,
        },
        {
          path: "swapper-b/",
          element: <SwapperB />,
        },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
