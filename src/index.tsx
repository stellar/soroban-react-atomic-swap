import * as React from "react";
import ReactDOM from "react-dom/client";

import { AtomicSwap } from "./components/atomic-swap";

import "@stellar/design-system/build/styles.min.css";
import "./index.scss";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<AtomicSwap />);
