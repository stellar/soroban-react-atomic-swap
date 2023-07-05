export enum ChannelMessageType {
  ContractID = "contract-id",
}

export const BROADCAST_ID = "soroban-react-atomic-swap";

export const bc = new BroadcastChannel(BROADCAST_ID);

bc.onmessageerror = (messageErrorEvent) => {
  console.log(messageErrorEvent);
};
