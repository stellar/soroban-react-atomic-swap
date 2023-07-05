enum ChannelMessageType {
  GetContractID = "get-contract-id",
  SetContractID = "set-contract-id",
}

enum StorageKeys {
  ContractId = "contract-id",
}

export const BROADCAST_ID = "soroban-react-atomic-swap";

export const bc = new BroadcastChannel(BROADCAST_ID);

bc.onmessage = (messageEvent) => {
  const { data, type } = messageEvent.data;
  switch (type) {
    case ChannelMessageType.SetContractID: {
      localStorage.setItem(StorageKeys.ContractId, data);
      return;
    }
    case ChannelMessageType.GetContractID: {
      localStorage.getItem(StorageKeys.ContractId);
      return;
    }
    default:
      console.log("message type unknown");
  }
};
