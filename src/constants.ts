export const RPC = {
  8453: {
    url: process.env.WS_RPC_URL || "",
    supportTraceAPI: false,
  },
};

export const CONTRACT_ADDRESS = "0x373065e66b32a1c428aa14698dfa99ba7199b55e";
export const BUY_TOPIC =
  "0x96c1b5a0ee3c1932c831b8c6a559c93b48a3109915784a05ff44a07cc09c3931";
export const SELL_TOPIC =
  "0x44ebb8a56b0413525e33cc89179d9758b2b1ab944b0bbeeb6d119adb2a6e3fe2";
export const STAKE_TOPIC =
  "0x3a199fad2706ca50fe2d207d8f1c2e37b04c6b8c3e9f88ec9917dfc18e4a4b34";
export const CHAIN_ID = 8453;
export const ETHERSCAN_ENDPOINT = "https://basescan.org";
export const FARCASTER_HUB_URL = process.env.FC_HUB_URL || "";
export const FRAME_ENDPOINT = "https://decoder-frame.fly.dev/frame";
export const FRAME_V2_ENDPOINT = "https://reach.3loop.io";

export const SPAM_LIST = ['0x98267d307ac89f24e62de9827dcfc214fa88427c']

//alert categories in moxie
export const CATEGORIES = {
  WHALE: 300000,
};
