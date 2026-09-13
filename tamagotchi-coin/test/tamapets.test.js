const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const H = 3600;
const FEED = ethers.parseEther("1000");
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function fixture() {
  const [deployer, a, b, c, reporter] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("MockTAMA");
  const token = await Token.deploy();
  const Pets = await ethers.getContractFactory("TamaPets");
  const pets = await Pets.deploy(await token.getAddress());
  const petsAddr = await pets.getAddress();
  for (const s of [a, b, c]) {
    await token.transfer(s.address, ethers.parseEther("10000000"));
    await token.connect(s).approve(petsAddr, ethers.MaxUint256);
  }
  const fund = (eth) => deployer.sendTransaction({ to: petsAddr, value: ethers.parseEther(eth) });
  const feedTimes = async (s, n) => { for (let i = 0; i < n; i++) await pets.connect(s).feed(); };
  return { deployer, a, b, c, reporter, token, pets, petsAddr, fund, feedTimes };
}

describe("TamaPets: hatch and feed", () => {
  it("hatching burns one feeding and starts a stage-0 pet with a 24h timer", async () => {
    const f = await loadFixture(fixture);
    const deadBefore = await f.token.balanceOf(DEAD);
    await expect(f.pets.connect(f.a).hatch()).to.emit(f.pets, "Hatched").withArgs(f.a.address, 1);
    expect(await f.token.balanceOf(DEAD)).to.equal(deadBefore + FEED);
    const p = await f.pets.pets(f.a.address);
    expect(p.alive).to.equal(true);
    expect(p.stage).to.equal(0);
    expect(p.burned).to.equal(FEED);
    expect(await f.pets.deadline(f.a.address)).to.equal(BigInt(await time.latest()) + BigInt(24 * H));
    expect(await f.pets.livingPets()).to.equal(1);
    expect(await f.pets.totalWeight()).to.equal(1);
  });

  it("cannot hatch twice while alive, cannot feed without a pet", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();
    await expect(f.pets.connect(f.a).hatch()).to.be.revertedWithCustomError(f.pets, "AlreadyAlive");
    await expect(f.pets.connect(f.b).feed()).to.be.revertedWithCustomError(f.pets, "NoPet");
  });

  it("feeding resets the timer and levels up at the thresholds", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();
    await time.increase(10 * H);
    await f.pets.connect(f.a).feed();
    expect(await f.pets.deadline(f.a.address)).to.equal(BigInt(await time.latest()) + BigInt(24 * H));
    // 10 feedings total (10k burned) -> stage 1, timer 20h, weight 2
    await f.feedTimes(f.a, 8);
    let p = await f.pets.pets(f.a.address);
    expect(p.stage).to.equal(1);
    expect(await f.pets.totalWeight()).to.equal(2);
    expect(await f.pets.deadline(f.a.address)).to.equal(BigInt(await time.latest()) + BigInt(20 * H));
    await f.feedTimes(f.a, 39);
    await expect(f.pets.connect(f.a).feed()).to.emit(f.pets, "StageUp").withArgs(f.a.address, 2); // 50k
    p = await f.pets.pets(f.a.address);
    expect(p.stage).to.equal(2);
    expect(await f.pets.totalWeight()).to.equal(4);
  });

  it("stageFor maps burned amounts to the eight stages", async () => {
    const f = await loadFixture(fixture);
    const e = ethers.parseEther;
    expect(await f.pets.stageFor(e("9999"))).to.equal(0);
    expect(await f.pets.stageFor(e("10000"))).to.equal(1);
    expect(await f.pets.stageFor(e("150000"))).to.equal(3);
    expect(await f.pets.stageFor(e("999999"))).to.equal(4);
    expect(await f.pets.stageFor(e("1000000"))).to.equal(5);
    expect(await f.pets.stageFor(e("6000000"))).to.equal(7);
    expect(await f.pets.stageTimer(7)).to.equal(2 * H);
    expect(await f.pets.stageWeight(7)).to.equal(128);
  });
});

describe("TamaPets: death", () => {
  it("expired pets cannot feed or claim, anyone can report the death", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();
    await expect(f.pets.connect(f.reporter).kill(f.a.address)).to.be.revertedWithCustomError(f.pets, "NotExpired");
    await time.increase(24 * H + 1);
    await expect(f.pets.connect(f.a).feed()).to.be.revertedWithCustomError(f.pets, "Expired");
    await expect(f.pets.connect(f.a).claim()).to.be.revertedWithCustomError(f.pets, "Expired");
    await expect(f.pets.connect(f.reporter).kill(f.a.address))
      .to.emit(f.pets, "Died").withArgs(f.a.address, f.reporter.address, 0, anyValue, 0);
    const p = await f.pets.pets(f.a.address);
    expect(p.alive).to.equal(false);
    expect(await f.pets.livingPets()).to.equal(0);
    expect(await f.pets.totalDeaths()).to.equal(1);
  });

  it("legacy redistribution math", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();
    await f.pets.connect(f.b).hatch();
    await f.fund("1"); // a: 0.5, b: 0.5
    await time.increase(20 * H);
    await f.pets.connect(f.b).feed(); // b stays alive
    await time.increase(4 * H + 1); // a expired
    const before = await ethers.provider.getBalance(f.reporter.address);
    const tx = await f.pets.connect(f.reporter).kill(f.a.address);
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const after = await ethers.provider.getBalance(f.reporter.address);
    expect(after - before + gas).to.equal(ethers.parseEther("0.05")); // 10 % of a's 0.5
    expect(await f.pets.pending(f.b.address)).to.equal(ethers.parseEther("0.95")); // own 0.5 + 0.45
    expect(await f.pets.pending(f.a.address)).to.equal(0);
  });

  it("hatching over an expired pet buries it without a reporter tip", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();
    await f.pets.connect(f.b).hatch();
    await f.fund("1");
    await time.increase(20 * H);
    await f.pets.connect(f.b).feed();
    await time.increase(5 * H);
    await expect(f.pets.connect(f.a).hatch())
      .to.emit(f.pets, "Died").withArgs(f.a.address, ethers.ZeroAddress, 0, anyValue, ethers.parseEther("0.5"))
      .and.to.emit(f.pets, "Hatched").withArgs(f.a.address, 2);
    // b received all of a's 0.5 before a's new pet joined
    expect(await f.pets.pending(f.b.address)).to.equal(ethers.parseEther("1"));
    expect(await f.pets.pending(f.a.address)).to.equal(0);
    expect(await f.pets.livingPets()).to.equal(2);
  });
});

describe("TamaPets: ETH sharing", () => {
  it("splits incoming ETH by stage weight and lets pets claim", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();            // weight 1
    await f.pets.connect(f.b).hatch();
    await f.feedTimes(f.b, 9);                     // 10k burned -> stage 1, weight 2
    await f.fund("3");                             // a: 1, b: 2
    expect(await f.pets.pending(f.a.address)).to.equal(ethers.parseEther("1"));
    expect(await f.pets.pending(f.b.address)).to.equal(ethers.parseEther("2"));

    const before = await ethers.provider.getBalance(f.b.address);
    const tx = await f.pets.connect(f.b).claim();
    const rc = await tx.wait();
    const after = await ethers.provider.getBalance(f.b.address);
    expect(after - before + rc.gasUsed * rc.gasPrice).to.equal(ethers.parseEther("2"));
    expect(await f.pets.pending(f.b.address)).to.equal(0);
    await expect(f.pets.connect(f.b).claim()).to.be.revertedWithCustomError(f.pets, "NothingToClaim");
    expect(await f.pets.totalEthClaimed()).to.equal(ethers.parseEther("2"));
  });

  it("a level-up keeps previously earned ETH and changes only future shares", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();
    await f.pets.connect(f.b).hatch();
    await f.fund("2");                             // 1 / 1
    await f.feedTimes(f.b, 9);                     // b -> weight 2
    await f.fund("3");                             // a +1, b +2
    expect(await f.pets.pending(f.a.address)).to.equal(ethers.parseEther("2"));
    expect(await f.pets.pending(f.b.address)).to.equal(ethers.parseEther("3"));
  });

  it("ETH sent while nobody is alive waits for the first hatch", async () => {
    const f = await loadFixture(fixture);
    await f.fund("1");
    expect(await f.pets.unallocated()).to.equal(ethers.parseEther("1"));
    await f.pets.connect(f.a).hatch();
    expect(await f.pets.unallocated()).to.equal(0);
    expect(await f.pets.pending(f.a.address)).to.equal(ethers.parseEther("1"));
  });

  it("contract balance always covers all pending claims", async () => {
    const f = await loadFixture(fixture);
    await f.pets.connect(f.a).hatch();
    await f.pets.connect(f.b).hatch();
    await f.pets.connect(f.c).hatch();
    await f.feedTimes(f.c, 49);                    // c -> stage 2, weight 4
    await f.fund("0.7");
    await f.feedTimes(f.a, 9);
    await f.fund("1.3");
    await f.pets.connect(f.a).claim();
    await time.increase(24 * H + 1);
    // b expired (never fed), a and c fed within window? a stage1 timer 20h -> expired too. Feed c earlier:
    const bal = await ethers.provider.getBalance(f.petsAddr);
    const sum = (await f.pets.pending(f.a.address)) + (await f.pets.pending(f.b.address)) + (await f.pets.pending(f.c.address));
    expect(bal).to.be.gte(sum);
  });
});
