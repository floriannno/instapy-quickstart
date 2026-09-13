require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const path = require("path");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Use the solc build shipped in node_modules instead of downloading one.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    const soljson = path.join(__dirname, "node_modules", "solc", "soljson.js");
    return { compilerPath: soljson, isSolcJs: true, version: "0.8.24", longVersion: "0.8.24+commit.e11b9ed9" };
  }
  return runSuper();
});

const PRIVATE_KEY = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    hardhat: {},
    robinhoodTestnet: { url: process.env.ROBINHOOD_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com", chainId: 46630, accounts: PRIVATE_KEY },
    robinhoodMainnet: { url: process.env.ROBINHOOD_MAINNET_RPC || "https://rpc.mainnet.chain.robinhood.com", chainId: 4663, accounts: PRIVATE_KEY },
  },
  etherscan: {
    apiKey: { robinhoodTestnet: "no-key-needed", robinhoodMainnet: "no-key-needed" },
    customChains: [
      { network: "robinhoodMainnet", chainId: 4663, urls: { apiURL: "https://robinhoodchain.blockscout.com/api", browserURL: "https://robinhoodchain.blockscout.com" } },
      { network: "robinhoodTestnet", chainId: 46630, urls: { apiURL: "https://explorer.testnet.chain.robinhood.com/api", browserURL: "https://explorer.testnet.chain.robinhood.com" } },
    ],
  },
};
