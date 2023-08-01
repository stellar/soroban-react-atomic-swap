# Soroban React Atomic Swap

The Atomic Swap DApp is a simplified demo of a dapp that performs an atomic
operation to swap 2 potentially different amounts of 2 tokens between 2 separate
parties, optionally signed and submitted by a third party.

## Prerequisites

The Atomic Swap DApp relies on the following dependencies:

- Node (>=16.14.0 <=18.0.0): https://nodejs.org/en/download/

- Yarn (v1.22.5 or newer): https://classic.yarnpkg.com/en/docs/install

- Freighter wallet(v5.0 or newer): https://www.freighter.app/

## Features

The Atomic Swap DApp offers the following features:

1. **Freighter Wallet Integration**: The Atomic Swap DApp seamlessly integrates
   with Freighter/Albedo/XBull, allowing users to connect their wallet to access
   Soroban token balances and utilize their signing capabilities for secure and
   integrity-checked transactions.

2. **Transaction Construction**: Leveraging the Soroban atomic swap contract
   interface, the DApp constructs transactions that invoke the `swap` method of
   the
   [swap interface](https://github.com/stellar/soroban-examples/blob/main/atomic_swap/src/lib.rs#L16).
   This method facilitates an atomic swap operation on the Soroban network.

## Getting Started

To use the Atomic Swap DApp, follow these steps:

1. Install and set up one of the supported wallets.

- [Freighter wallet](https://www.freighter.app/)
- [Albedo wallet](https://albedo.link/install-extension)
- [XBull wallet](https://xbull.app/)

2. Clone and navigate into the
   [Atomic Swap DApp repository](https://github.com/stellar/soroban-react-atomic-swap/tree/main)
   by running the following:

   ```
   git clone https://github.com/stellar/soroban-react-atomic-swap.git
   cd soroban-react-atomic-swap
   ```

3. Install the dependencies by running the following:

   ```
   yarn
   ```

4. If you are using the Freighter wallet, ensure that experimental mode is
   enabled. You can find this setting in Freighter wallet at:
   _`Settings(⚙️)>Preferences>ENABLE EXPERIMENTAL MODE`_.

<img src = "./public/img/freighter_settings.png" width="50%" height="50%"/>

6. [Enable and add Soroban Tokens](https://soroban.stellar.org/docs/reference/freighter#enable-soroban-tokens)
   in Freighter.

7. To run the app and install dependencies you can run `yarn && yarn start`
