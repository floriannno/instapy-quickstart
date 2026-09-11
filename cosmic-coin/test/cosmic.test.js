const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const DAY = 24 * 60 * 60;

async function signDetection(signer, oracleAddr, detectorId, nonce, timestamp, adc) {
  const { chainId } = await ethers.provider.getNetwork();
  const digest = ethers.solidityPackedKeccak256(
    ["uint256", "address", "uint256", "uint256", "uint256", "uint256"],
    [chainId, oracleAddr, detectorId, nonce, timestamp, adc]
  );
  return signer.signMessage(ethers.getBytes(digest));
}

async function deployFixture() {
  const [deployer, detector, team, community, relayer, stranger] = await ethers.getSigners();
  const now = await time.latest();

  const Oracle = await ethers.getContractFactory("MuonOracle");
  const oracle = await Oracle.deploy(deployer.address, 60, 3600, 100);

  const Vesting = await ethers.getContractFactory("VestingWallet");
  const teamVesting = await Vesting.deploy(team.address, now, 365 * DAY);
  const communityVesting = await Vesting.deploy(community.address, now, 365 * DAY);

  const Token = await ethers.getContractFactory("CosmicCoin");
  const token = await Token.deploy(
    await oracle.getAddress(),
    await teamVesting.getAddress(),
    await communityVesting.getAddress(),
    7 * DAY
  );

  const Vault = await ethers.getContractFactory("CosmicVault");
  const vault = await Vault.deploy(
    deployer.address,
    await token.getAddress(),
    await oracle.getAddress(),
    500, // 5 % of balance per event
    ethers.parseEther("0.1")
  );

  await oracle.wire(await token.getAddress(), await vault.getAddress());
  await oracle.registerDetector(detector.address); // id 1

  const Mock = await ethers.getContractFactory("MockExecutor");
  const mock = await Mock.deploy(1000n); // 1000 tokens per wei
  await token.transfer(await mock.getAddress(), ethers.parseEther("1000000"));
  await vault.setExecutor(await mock.getAddress());
  await deployer.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("1") });

  return { deployer, detector, team, community, relayer, stranger, oracle, token, vault, mock, teamVesting, communityVesting };
}

async function submit(f, { nonce, adc = 500, from, timestamp, minOut = 0 }) {
  const ts = timestamp ?? (await time.latest());
  const sig = await signDetection(f.detector, await f.oracle.getAddress(), 1, nonce, ts, adc);
  return f.oracle.connect(from ?? f.relayer).submitDetection(1, nonce, ts, adc, minOut, sig);
}

describe("CosmicCoin", () => {
  it("mints the fixed supply with the public split", async () => {
    const f = await loadFixture(deployFixture);
    const total = await f.token.TOTAL_SUPPLY();
    expect(await f.token.totalSupply()).to.equal(total);
    expect(await f.token.balanceOf(await f.teamVesting.getAddress())).to.equal(total / 10n);
    expect(await f.token.balanceOf(await f.communityVesting.getAddress())).to.equal(total / 10n);
    // deployer holds 80 % minus what the fixture moved to the mock
    expect(await f.token.balanceOf(f.deployer.address)).to.equal(
      (total * 8n) / 10n - ethers.parseEther("1000000")
    );
  });

  it("blocks transfers before launch except from the launcher", async () => {
    const f = await loadFixture(deployFixture);
    await f.token.transfer(f.stranger.address, 1000n); // launcher may seed
    await expect(f.token.connect(f.stranger).transfer(f.team.address, 1n))
      .to.be.revertedWithCustomError(f.token, "TradingNotEnabled");
  });

  it("only the oracle can launch, emergency launch only after the delay", async () => {
    const f = await loadFixture(deployFixture);
    await expect(f.token.launch(1)).to.be.revertedWithCustomError(f.token, "NotOracle");
    await expect(f.token.emergencyLaunch()).to.be.revertedWithCustomError(f.token, "TooEarly");
    await expect(f.token.connect(f.stranger).emergencyLaunch())
      .to.be.revertedWithCustomError(f.token, "NotLauncher");
    await time.increase(7 * DAY + 1);
    await expect(f.token.emergencyLaunch()).to.emit(f.token, "Launched").withArgs(0, anyValue(), true);
    expect(await f.token.tradingEnabled()).to.equal(true);
  });
});

describe("MuonOracle", () => {
  it("first accepted detection launches the token", async () => {
    const f = await loadFixture(deployFixture);
    await expect(submit(f, { nonce: 1 }))
      .to.emit(f.oracle, "MuonDetected").withArgs(1, 1, anyValue(), 500, true)
      .and.to.emit(f.token, "Launched");
    expect(await f.token.tradingEnabled()).to.equal(true);
    expect(await f.token.launchEventId()).to.equal(1);
    // trading now open for everyone
    await f.token.transfer(f.stranger.address, 1000n);
    await f.token.connect(f.stranger).transfer(f.team.address, 1n);
  });

  it("rejects replays, wrong signers, noise and stale events", async () => {
    const f = await loadFixture(deployFixture);
    await submit(f, { nonce: 1 });
    await time.increase(61);
    await expect(submit(f, { nonce: 1 })).to.be.revertedWithCustomError(f.oracle, "BadNonce");
    await expect(submit(f, { nonce: 3 })).to.be.revertedWithCustomError(f.oracle, "BadNonce");
    await expect(submit(f, { nonce: 2, adc: 50 })).to.be.revertedWithCustomError(f.oracle, "BelowThreshold");
    const old = (await time.latest()) - 4000;
    await expect(submit(f, { nonce: 2, timestamp: old })).to.be.revertedWithCustomError(f.oracle, "StaleDetection");
    const future = (await time.latest()) + 1000;
    await expect(submit(f, { nonce: 2, timestamp: future })).to.be.revertedWithCustomError(f.oracle, "FutureDetection");

    // signature from an unregistered key
    const ts = await time.latest();
    const badSig = await signDetection(f.stranger, await f.oracle.getAddress(), 1, 2, ts, 500);
    await expect(f.oracle.submitDetection(1, 2, ts, 500, 0, badSig))
      .to.be.revertedWithCustomError(f.oracle, "UnknownDetector");
  });

  it("enforces the network-wide cooldown", async () => {
    const f = await loadFixture(deployFixture);
    await submit(f, { nonce: 1 });
    await expect(submit(f, { nonce: 2 })).to.be.revertedWithCustomError(f.oracle, "CooldownActive");
    await time.increase(61);
    await submit(f, { nonce: 2 });
    expect(await f.oracle.eventCount()).to.equal(2);
  });

  it("refuses detections before wiring and from deactivated detectors", async () => {
    const [deployer, detector] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("MuonOracle");
    const bare = await Oracle.deploy(deployer.address, 60, 3600, 100);
    await bare.registerDetector(detector.address);
    const ts = await time.latest();
    const sig = await signDetection(detector, await bare.getAddress(), 1, 1, ts, 500);
    await expect(bare.submitDetection(1, 1, ts, 500, 0, sig)).to.be.revertedWithCustomError(bare, "NotWired");

    const f = await loadFixture(deployFixture);
    await f.oracle.deactivateDetector(1);
    await expect(submit(f, { nonce: 1 })).to.be.revertedWithCustomError(f.oracle, "UnknownDetector");
  });
});

describe("CosmicVault", () => {
  it("buys and burns a capped slice on every detection after launch", async () => {
    const f = await loadFixture(deployFixture);
    await submit(f, { nonce: 1 }); // launch
    await time.increase(61);

    const supplyBefore = await f.token.totalSupply();
    const spend = ethers.parseEther("0.05"); // 5 % of 1 ETH, below the 0.1 cap
    await expect(submit(f, { nonce: 2 }))
      .to.emit(f.vault, "Buyback").withArgs(2, spend, spend * 1000n);

    expect(await ethers.provider.getBalance(await f.vault.getAddress())).to.equal(ethers.parseEther("0.95"));
    expect(await f.token.totalSupply()).to.equal(supplyBefore - spend * 1000n);
    expect(await f.token.balanceOf(await f.vault.getAddress())).to.equal(0);
    expect(await f.vault.totalEthSpent()).to.equal(spend);
  });

  it("respects the hard cap per event", async () => {
    const f = await loadFixture(deployFixture);
    await f.vault.setLimits(10_000, ethers.parseEther("0.1")); // 100 % but capped
    await submit(f, { nonce: 1 });
    await time.increase(61);
    await expect(submit(f, { nonce: 2 }))
      .to.emit(f.vault, "Buyback").withArgs(2, ethers.parseEther("0.1"), anyValue());
  });

  it("records the detection even when the swap fails or slippage is too tight", async () => {
    const f = await loadFixture(deployFixture);
    await submit(f, { nonce: 1 });
    await time.increase(61);
    await f.mock.setFail(true);
    await expect(submit(f, { nonce: 2 }))
      .to.emit(f.vault, "BuybackSkipped").withArgs(2, "swap failed")
      .and.to.emit(f.oracle, "MuonDetected");
    await f.mock.setFail(false);
    await time.increase(61);
    await expect(submit(f, { nonce: 3, minOut: ethers.parseEther("1000000000") }))
      .to.emit(f.vault, "BuybackSkipped").withArgs(3, "swap failed");
    expect(await f.oracle.eventCount()).to.equal(3);
  });

  it("only the oracle may trigger it and ETH cannot be withdrawn", async () => {
    const f = await loadFixture(deployFixture);
    await expect(f.vault.onDetection(1, 0)).to.be.revertedWithCustomError(f.vault, "NotOracle");
    expect(f.vault.interface.getFunction("withdraw")).to.equal(null);
    await expect(f.vault.setLimits(10_001, 0)).to.be.revertedWithCustomError(f.vault, "BpsTooHigh");
  });
});

// Matches any value in withArgs (helper from hardhat-chai-matchers).
function anyValue() {
  return require("@nomicfoundation/hardhat-chai-matchers/withArgs").anyValue;
}
