// Filled by scripts/deploy.js. Pick the network with ?net=testnet or ?net=mainnet (default testnet).
export const NETWORKS = {
  testnet: { chainId: 46630, pets: "", token: "" },
  mainnet: { chainId: 4663, pets: "", token: "" },
  local: { chainId: 31337, pets: "", token: "" },
};
export const RPC = {
  46630: "https://rpc.testnet.chain.robinhood.com",
  4663: "https://rpc.mainnet.chain.robinhood.com",
  31337: "http://127.0.0.1:8545",
};
export const EXPLORER = {
  46630: "https://explorer.testnet.chain.robinhood.com",
  4663: "https://robinhoodchain.blockscout.com",
};
// WalletConnect Cloud project id (https://cloud.walletconnect.com). Empty = injected wallets only.
export const WALLETCONNECT_PROJECT_ID = "";
