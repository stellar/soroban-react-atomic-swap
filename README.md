# Soroban React Atomic Swap

The Atomic Swap DApp is a simplified demo of a dapp that performs an atomic
operation to swap 2 potentially different amounts of 2 tokens between 2 separate
parties, optionally signed and submitted by a third party.

## Prerequisites

The Atomic Swap DApp relies on the following dependencies:

- Node (>=16.14.0 <=18.0.0): https://nodejs.org/en/download/

- Yarn (v1.22.5 or newer): https://classic.yarnpkg.com/en/docs/install

- Freighter wallet(v5.0 or newer): https://www.freighter.app/

You need access to/funds from the following contracts - Atomic Swap:
https://github.com/stellar/soroban-examples/tree/main/atomic_swap Token:
https://github.com/stellar/soroban-examples/tree/main/token

This demo involves a minimum of 2 parties and 2 different tokens to swap between
the parties.

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

4. Deploy the Atomic Swap smart contracts.

For this step you will need to clone and deploy the
[Atomic Swap smart contract](https://github.com/stellar/soroban-examples/blob/main/atomic_swap/src/lib.rs).
The Atomic Swap smart contract is a custom contract that will be used to
facilitate swaps in the Atomic Swap Dapp.

In a new terminal window, follow the steps below to build and deploy the smart
contracts:

```bash
git clone https://github.com/stellar/soroban-examples.git
cd soroban-examples/atomic_swap
make
```

This will build the smart contracts and put them in the
`atomic_swap/target/wasm32-unknown-unknown/release` directory.

Next, you will need to deploy the smart contracts to Futurenet. To do this, open
a terminal in the `soroban-examples/atomic_swap` directory and follow the steps
below:

```bash
soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/soroban_atomic_swap_contract.wasm \
    --source <ADMIN_ACCOUNT_SECRET_KEY> \
    --rpc-url https://rpc-futurenet.stellar.org:443 \
    --network-passphrase 'Test SDF Future Network ; October 2022'
```

This will return a contract id that we will need to use later on.

```bash
# Example output used for ATOMIC_SWAP_CONTRACT_ID
CCWXGZ6PCOORP7UKO2GVYS5PFYR4BND4XDYTQMO2B32SKXVX4DUKUUZ6
```

5. Deploy the Soroban token smart contracts.

For this step you will need to clone and deploy the
[Soroban token smart contracts](https://github.com/stellar/soroban-examples/blob/main/token/src/contract.rs).
The Soroban tokens are custom tokens that will be swapped in the Atomic Swap
Dapp.

Open a new terminal window in the `soroban-examples` directory and follow the
steps below to build and deploy the smart contracts:

```bash
cd token
make
```

This will build the smart contracts and put them in the
`token/target/wasm32-unknown-unknown/release` directory.

Next, you will need to deploy the smart contracts to Futurenet. To do this,
follow the steps below:

```bash
soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/soroban_token_contract.wasm \
    --source <ADMIN_ACCOUNT_SECRET_KEY> \
    --rpc-url https://rpc-futurenet.stellar.org:443 \
    --network-passphrase 'Test SDF Future Network ; October 2022'
```

This will return a contract id that we will need to use later on.

```bash
# Example output used for TOKEN_A_CONTRACT_ID
CCZZ763JDLSHEXUFUIHIKOVAAKYU2CUXSUH5MP4MH2HDZYGOYMM3RDD5
```

```bash
soroban contract invoke \
    --id <TOKEN_A_CONTRACT_ID> \
    --source-account <ADMIN_ACCOUNT_SECRET_KEY> \
    --rpc-url https://rpc-futurenet.stellar.org:443 \
    --network-passphrase 'Test SDF Future Network ; October 2022' \
    -- initialize \
    --admin <ADMIN_PUBLIC_KEY> \
    --decimal 7 \
    --name "Demo Token A" \
    --symbol "DTA"
```

Next we will need to mint some tokens to your user's account. To do this, run
the following command:

```bash
soroban contract invoke \
    --id <TOKEN_A_CONTRACT_ID> \
    --source-account <ADMIN_ACCOUNT_SECRET_KEY> \
    --rpc-url https://rpc-futurenet.stellar.org:443 \
    --network-passphrase 'Test SDF Future Network ; October 2022' \
    -- mint \
    --to <USER_PUBLIC_KEY> \
    --amount 1000000000
```

Remember: You'll be deploying and minting the token contract twice, once for
each token involved in the swap. Make sure to store both Contract Ids. After
deploying the first token contract using the steps outlined above, simply repeat
the process for the second token.

Once deployed, you can initialize and mint the second token contract with the
same commands for the first token contract, replacing the contract id with the
second token contract id:

**_Initialize:_**

```bash
soroban contract invoke \
    --id <TOKEN_B_CONTRACT_ID> \
    --source-account <ADMIN_ACCOUNT_SECRET_KEY> \
    --rpc-url https://rpc-futurenet.stellar.org:443 \
    --network-passphrase 'Test SDF Future Network ; October 2022' \
    -- initialize \
    --admin <ADMIN_PUBLIC_KEY> \
    --decimal 7 \
    --name "Demo Token B" \
    --symbol "DTB"
```

For the Atomic Swap Dapp, we will need to mint some tokens to a second user's
account. To do this, run the following command:

```bash
soroban contract invoke \
    --id <TOKEN_B_CONTRACT_ID> \
    --source-account <ADMIN_ACCOUNT_SECRET_KEY> \
    --rpc-url https://rpc-futurenet.stellar.org:443 \
    --network-passphrase 'Test SDF Future Network ; October 2022' \
    -- mint \
    --to <USER_B_PUBLIC_KEY> \
    --amount 1000000000
```

6. [Enable and add Soroban Tokens](https://soroban.stellar.org/docs/reference/freighter#enable-soroban-tokens)
   in Freighter.

7. In the `soroban-react-atomic-swap` directory run the front end with
   `yarn start` and navigate to http://localhost:9000/ in your browser.

8. Connect your wallet to the Atomic Swap Dapp by clicking the "Connect Wallet"
   button in the top right corner of the screen. This will open a
   Freighter/Albedo/XBull window where you can select your account and sign the
   transaction.

TODO: finish this section
