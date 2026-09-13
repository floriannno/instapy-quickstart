// npx hardhat run scripts/deploy.js --network robinhoodTestnet
// Env: PRIVATE_KEY. TAMA_TOKEN for mainnet (the Pons-created token); empty on testnet deploys MockTAMA.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`network ${network.name}, deployer ${deployer.address}`);

  let tokenAddr = process.env.TAMA_TOKEN;
  if (!tokenAddr) {
    if (network.name === "robinhoodMainnet") throw new Error("TAMA_TOKEN must be set on mainnet");
    const Mock = await ethers.getContractFactory("MockTAMA");
    const mock = await Mock.deploy();
    await mock.waitForDeployment();
    tokenAddr = await mock.getAddress();
    console.log(`MockTAMA deployed at ${tokenAddr} (faucet(): 100k tTAMA per call)`);
  }

  const Pets = await ethers.getContractFactory("TamaPets");
  const pets = await Pets.deploy(tokenAddr);
  await pets.waitForDeployment();
  const petsAddr = await pets.getAddress();

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    token: tokenAddr,
    pets: petsAddr,
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));

  // keep the app config in sync
  const cfgPath = path.join(__dirname, "..", "app", "config.js");
  const cfg = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, "utf8") : "";
  const key = network.name === "robinhoodMainnet" ? "mainnet" : network.name === "localhost" ? "local" : "testnet";
  const line = `  ${key}: { chainId: ${out.chainId}, pets: "${petsAddr}", token: "${tokenAddr}" },`;
  if (cfg.includes(`  ${key}:`)) {
    fs.writeFileSync(cfgPath, cfg.replace(new RegExp(`  ${key}: \\{[^\\n]*\\},`), line));
    console.log(`app/config.js updated (${key})`);
  }
  console.log(JSON.stringify(out, null, 2));
  console.log("\nnext: set the Pons creator-fee address to", petsAddr);
}

main().catch((e) => { console.error(e); process.exit(1); });
