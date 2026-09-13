import { ethers } from "./vendor/ethers.min.js";
import { NETWORKS, RPC, EXPLORER, WALLETCONNECT_PROJECT_ID } from "./config.js";
import { PETS_ABI, ERC20_ABI } from "./abi.js";
import { STAGE_NAMES, STAGE_SCENE, SPRITES, SCENES } from "./assets.js";

const $ = (id) => document.getElementById(id);
const netKey = new URLSearchParams(location.search).get("net") || "testnet";
const NET = NETWORKS[netKey];
const isTestnet = netKey !== "mainnet";

let provider, signer, account, pets, token;
let readProvider = new ethers.JsonRpcProvider(RPC[NET.chainId]);
let petsRead = NET.pets ? new ethers.Contract(NET.pets, PETS_ABI, readProvider) : null;
let state = null;
let tick = null;

// ---------------------------------------------------------------- rendering

function renderStrip(stage, alive) {
  $("strip").innerHTML = SPRITES.map((svg, i) => {
    const cls = !alive ? "locked" : i === stage ? "current" : i < stage ? "" : "locked";
    return `<div class="cell ${cls}">${svg}<span>${STAGE_NAMES[i]}</span></div>`;
  }).join("");
}

function renderScene(stage) {
  $("scene").innerHTML = SCENES[STAGE_SCENE[stage] || "day"];
}

function setSprite(stage, dead) {
  const el = $("sprite");
  el.innerHTML = SPRITES[stage] || SPRITES[0];
  el.classList.toggle("dead", !!dead);
}

function fmt(secs) {
  if (secs < 0) secs = 0;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function status(msg) { $("status").textContent = msg || ""; }

function show(view) {
  for (const id of ["btnConnect", "btnHatch", "btnFeed", "btnFaucet", "timerbox", "bar", "pending"]) $(id).hidden = true;
  if (view === "connect") { $("btnConnect").hidden = false; }
  if (view === "hatch") { $("btnHatch").hidden = false; if (isTestnet) $("btnFaucet").hidden = false; }
  if (view === "pet") { $("btnFeed").hidden = false; $("timerbox").hidden = false; $("bar").hidden = false; $("pending").hidden = false; if (isTestnet) $("btnFaucet").hidden = false; }
  if (view === "dead") { $("btnHatch").hidden = false; $("btnHatch").textContent = "NEUES EI · 1.000 TAMA"; if (isTestnet) $("btnFaucet").hidden = false; }
}

// ---------------------------------------------------------------- state

async function refresh() {
  if (!petsRead) { status("Noch kein Contract eingetragen (app/config.js)."); renderScene(3); setSprite(3); renderStrip(3, false); show("connect"); return; }
  if (!account) { renderScene(3); setSprite(3); renderStrip(3, false); show("connect"); return; }

  const p = await petsRead.pets(account);
  const alive = p.alive;
  const stage = Number(p.stage);
  const deadline = Number(await petsRead.deadline(account));
  const now = Math.floor(Date.now() / 1000);
  const expired = alive && now > deadline;
  const pendingEth = alive && !expired ? await petsRead.pending(account) : 0n;
  const timer = Number(await petsRead.stageTimer(stage));
  state = { alive, stage, deadline, expired, timer };

  renderScene(alive ? stage : 3);
  renderStrip(stage, alive && !expired);
  setSprite(alive ? stage : 3, expired || (!alive && p.generation > 0n));
  $("pendingEth").textContent = `${Number(ethers.formatEther(pendingEth)).toFixed(5)} ETH`;
  $("name").textContent = alive ? `GLUTZAHN · ${STAGE_NAMES[stage].toUpperCase()}` : "TAMAGOTCHI";

  if (!alive && p.generation === 0n) { show("hatch"); status("Du hast noch kein Tier."); }
  else if (!alive || expired) { show("dead"); status(expired ? "Dein Tier ist verhungert." : "Dein Tier ist gestorben."); }
  else { show("pet"); status(""); }

  clearInterval(tick);
  if (alive && !expired) {
    const update = () => {
      const left = state.deadline - Math.floor(Date.now() / 1000);
      $("timer").textContent = fmt(left);
      $("timer").classList.toggle("danger", left < 3600);
      $("barfill").style.width = `${Math.max(0, Math.min(100, (left / state.timer) * 100))}%`;
      if (left <= 0) { clearInterval(tick); refresh(); }
    };
    update();
    tick = setInterval(update, 1000);
  }
}

// ---------------------------------------------------------------- wallet

async function connect() {
  let eip1193 = window.ethereum;
  if (!eip1193 && WALLETCONNECT_PROJECT_ID) {
    const { EthereumProvider } = await import("https://cdn.jsdelivr.net/npm/@walletconnect/ethereum-provider@2.17.0/dist/index.es.js");
    eip1193 = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [NET.chainId],
      rpcMap: { [NET.chainId]: RPC[NET.chainId] },
      showQrModal: true,
    });
    await eip1193.enable();
  }
  if (!eip1193) { status("Keine Wallet gefunden. Öffne die Seite im Browser deiner Wallet-App."); return; }

  provider = new ethers.BrowserProvider(eip1193);
  await provider.send("eth_requestAccounts", []);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== NET.chainId) {
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: ethers.toBeHex(NET.chainId) }]);
    } catch (e) {
      await provider.send("wallet_addEthereumChain", [{
        chainId: ethers.toBeHex(NET.chainId),
        chainName: isTestnet ? "Robinhood Chain Testnet" : "Robinhood Chain",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [RPC[NET.chainId]],
        blockExplorerUrls: [EXPLORER[NET.chainId]],
      }]);
    }
    provider = new ethers.BrowserProvider(eip1193);
  }
  signer = await provider.getSigner();
  account = await signer.getAddress();
  pets = new ethers.Contract(NET.pets, PETS_ABI, signer);
  token = new ethers.Contract(NET.token, ERC20_ABI, signer);
  $("account").textContent = `${account.slice(0, 6)}…${account.slice(-4)} · ${isTestnet ? "Testnet" : "Mainnet"}`;
  eip1193.on?.("accountsChanged", () => location.reload());
  eip1193.on?.("chainChanged", () => location.reload());
  await refresh();
}

async function ensureAllowance(amount) {
  const allowance = await token.allowance(account, NET.pets);
  if (allowance >= amount) return;
  status("Freigabe für TAMA bestätigen…");
  const tx = await token.approve(NET.pets, ethers.MaxUint256);
  await tx.wait();
}

async function run(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  try {
    await fn();
  } catch (e) {
    const msg = e?.shortMessage || e?.reason || e?.message || String(e);
    status(msg.includes("insufficient") || msg.includes("transfer amount exceeds") ? "Nicht genug TAMA in der Wallet." : msg.slice(0, 80));
  } finally {
    btn.disabled = false;
    btn.textContent = old;
    await refresh();
  }
}

$("btnConnect").onclick = () => run($("btnConnect"), "", connect);
$("btnHatch").onclick = () => run($("btnHatch"), "", async () => {
  const cost = await petsRead.FEED_COST();
  const bal = await token.balanceOf(account);
  if (bal < cost) { status("Nicht genug TAMA in der Wallet."); return; }
  await ensureAllowance(cost);
  status("Ei schlüpft…");
  const tx = await pets.hatch();
  await tx.wait();
  status("Willkommen, Glutzahn.");
});
$("btnFeed").onclick = () => run($("btnFeed"), "", async () => {
  const cost = await petsRead.FEED_COST();
  const bal = await token.balanceOf(account);
  if (bal < cost) { status("Nicht genug TAMA in der Wallet."); return; }
  await ensureAllowance(cost);
  status("Füttern…");
  const tx = await pets.feed();
  await tx.wait();
  status("Satt. Uhr zurückgesetzt.");
});
$("btnClaim").onclick = () => run($("btnClaim"), "", async () => {
  status("ETH abholen…");
  const tx = await pets.claim();
  await tx.wait();
  status("ETH ist in deiner Wallet.");
});
$("btnFaucet").onclick = () => run($("btnFaucet"), "", async () => {
  status("Test-TAMA kommen…");
  const tx = await token.faucet();
  await tx.wait();
  status("100.000 tTAMA erhalten.");
});

refresh();
