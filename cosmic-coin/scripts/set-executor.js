// Deploys a Uniswap adapter and points the vault at it.
//
//   npx hardhat run scripts/set-executor.js --network robinhoodTestnet
//
// Env: either UNISWAP_V3_ROUTER + WETH (+ V3_POOL_FEE) or UNISWAP_V2_ROUTER + WETH
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const d = JSON.parse(fs.readFileSync(file));
  const weth = process.env.WETH;
  if (!weth) throw new Error("missing env WETH");

  let executor;
  if (process.env.UNISWAP_V3_ROUTER) {
    const fee = Number(process.env.V3_POOL_FEE || 3000);
    const F = await ethers.getContractFactory("UniswapV3Executor");
    executor = await F.deploy(process.env.UNISWAP_V3_ROUTER, weth, fee);
    d.executorKind = `v3 fee ${fee}`;
  } else if (process.env.UNISWAP_V2_ROUTER) {
    const F = await ethers.getContractFactory("UniswapV2Executor");
    executor = await F.deploy(process.env.UNISWAP_V2_ROUTER, weth);
    d.executorKind = "v2";
  } else {
    throw new Error("set UNISWAP_V3_ROUTER or UNISWAP_V2_ROUTER");
  }
  await executor.waitForDeployment();

  const vault = await ethers.getContractAt("CosmicVault", d.vault);
  await (await vault.setExecutor(await executor.getAddress())).wait();
  d.executor = await executor.getAddress();
  fs.writeFileSync(file, JSON.stringify(d, null, 2));
  console.log(`executor ${d.executor} (${d.executorKind}) set on vault ${d.vault}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
