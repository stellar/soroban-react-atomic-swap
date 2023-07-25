export enum ChannelMessageType {
  ContractID = "contract-id",
  BuiltTx = "built-tx",
  SignedTx = "signed-tx",
  TxSim = "tx-sim",
  Footprint = "footprint",
}

export const BROADCAST_ID = "soroban-react-atomic-swap";

export const bc = new BroadcastChannel(BROADCAST_ID);

bc.onmessageerror = (messageErrorEvent) => {
  console.log(messageErrorEvent);
};
