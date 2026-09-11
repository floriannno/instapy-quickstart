// Deploys the full stack and writes deployments/<network>.json
//
//   npx hardhat run scripts/deploy.js --network robinhoodTestnet
//
// Required env: PRIVATE_KEY, DETECTOR_SIGNER, TEAM_WALLET, COMMUNITY_WALLET
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DAY = 24 * 60 * 60;

// Oracle parameters. Tune after watching the detector for a day.
const COOLDOWN = 15 * 60;   // at most one accepted event every 15 minutes
const MAX_AGE = 60 * 60;    // reject events older than an hour
const MIN_ADC = 100;        // CosmicWatch noise floor, calibrate per detector

// Vault limits: spend 2 % of the balance per event, never more than 0.05 ETH
const SPEND_BPS = 200;
const MAX_SPEND = ethers.parseEther("0.05");

const EMERGENCY_DELAY = 14 * DAY;
const VESTING_DURATION = 365 * DAY;

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const detectorSigner = need("DETECTOR_SIGNER");
  const teamWallet = need("TEAM_WALLET");
  const communityWallet = need("COMMUNITY_WALLET");
  console.log(`network ${network.name}, deployer ${deployer.address}`);

  const now = Math.floor(Date.now() / 1000);
  const Vesting = await ethers.getContractFactory("VestingWallet");
  const teamVesting = await Vesting.deploy(teamWallet, now, VESTING_DURATION);
  await teamVesting.waitForDeployment();
  const communityVesting = await Vesting.deploy(communityWallet, now, VESTING_DURATION);
  await communityVesting.waitForDeployment();

  const Oracle = await ethers.getContractFactory("MuonOracle");
  const oracle = await Oracle.deploy(deployer.address, COOLDOWN, MAX_AGE, MIN_ADC);
  await oracle.waitForDeployment();

  const Token = await ethers.getContractFactory("CosmicCoin");
  const token = await Token.deploy(
    await oracle.getAddress(),
    await teamVesting.getAddress(),
    await communityVesting.getAddress(),
    EMERGENCY_DELAY
  );
  await token.waitForDeployment();

  const Vault = await ethers.getContractFactory("CosmicVault");
  const vault = await Vault.deploy(
    deployer.address,
    await token.getAddress(),
    await oracle.getAddress(),
    SPEND_BPS,
    MAX_SPEND
  );
  await vault.waitForDeployment();

  await (await oracle.wire(await token.getAddress(), await vault.getAddress())).wait();
  const tx = await oracle.registerDetector(detectorSigner);
  await tx.wait();

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    oracle: await oracle.getAddress(),
    token: await token.getAddress(),
    vault: await vault.getAddress(),
    teamVesting: await teamVesting.getAddress(),
    communityVesting: await communityVesting.getAddress(),
    detectorSigner,
    detectorId: 1,
    params: { COOLDOWN, MAX_AGE, MIN_ADC, SPEND_BPS, MAX_SPEND: MAX_SPEND.toString(), EMERGENCY_DELAY },
    deployedAt: new Date().toISOString(),
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log(`\nwritten to ${file}`);
  console.log("next: seed the pool with the launcher's 80 %, then run scripts/set-executor.js");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
