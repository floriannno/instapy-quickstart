# Tamagotchi Coin (TAMA)

Ein Memecoin auf Robinhood Chain, der ein Tier ist. Jede Wallet hat genau eines.
Füttern verbrennt TAMA. Wer nicht füttert, verliert sein Tier. Lebende Tiere teilen sich
die ETH-Handelsgebühr vom Launchpad.

## Regeln (fest im Contract)

| Regel | Wert |
|---|---|
| Fütterung | 1.000 TAMA, werden an `0x…dEaD` geschickt |
| Schlüpfen | eine Fütterung |
| Stufen | Ei, Larve, Küken, Tier, Bestie, Drache, Uralt, Legende |
| Schwellen (insgesamt verbrannt) | 0, 10k, 50k, 150k, 400k, 1M, 2,5M, 6M |
| Timer je Stufe | 24h, 20h, 16h, 8h, 6h, 4h, 3h, 2h |
| Gewicht je Stufe | 1, 2, 4, 8, 16, 32, 64, 128 |
| Tod | nach Ablauf darf jeder `kill(owner)` rufen |
| Nachlass | 10 % an den Melder, 90 % an die lebenden Tiere |
| ETH-Verteilung | 100 % an lebende Tiere, nach Gewicht, jederzeit `claim()` |
| Team | kein Token-Anteil, kein ETH-Anteil, kein Admin |

Der Token selbst wird von Pons erzeugt (1 Milliarde, Standard-ERC-20). Dieser Contract
bekommt nur seine Adresse. Die Creator-Gebühr von Pons muss auf die Adresse von
`TamaPets` gesetzt werden, dann fließt das ETH automatisch an die Tiere.

## Ordner

- `contracts/TamaPets.sol` – das ganze Spiel, vier Aktionen: `hatch`, `feed`, `kill`, `claim`
- `contracts/mocks/MockTAMA.sol` – Test-Token mit `faucet()` fürs Testnet
- `test/` – 11 Tests, `npx hardhat test`
- `scripts/deploy.js` – Deploy, schreibt `deployments/<netz>.json` und `app/config.js`
- `app/` – statische Handy-Web-App, kein Build-Schritt

## Setup

```bash
cd tamagotchi-coin
npm install
npx hardhat test
cp .env.example .env     # PRIVATE_KEY eintragen
```

## Testnet

```bash
npx hardhat run scripts/deploy.js --network robinhoodTestnet
```

Deployt MockTAMA und TamaPets, trägt beide Adressen in `app/config.js` ein. Testnet-ETH
gibt es über den Faucet in der Robinhood-Chain-Doku. Die App holt sich Test-TAMA per Knopf.

## App starten

Die App ist reines HTML, JS und CSS. Lokal:

```bash
cd app && python3 -m http.server 8080
```

Dann `http://localhost:8080/?net=testnet` im Browser einer Wallet-App öffnen, oder am
Desktop mit MetaMask. Zum Hosten den Ordner `app/` auf GitHub Pages, Vercel oder Netlify
legen. Für WalletConnect (QR-Code am Desktop) eine Project-ID von cloud.walletconnect.com
in `app/config.js` eintragen.

## Mainnet

1. Token auf Pons launchen, Adresse notieren.
2. `TAMA_TOKEN=0x…` in `.env`, dann `npx hardhat run scripts/deploy.js --network robinhoodMainnet`.
3. In Pons die Creator-Adresse auf die TamaPets-Adresse setzen.
4. Contract im Explorer verifizieren: `npx hardhat verify --network robinhoodMainnet <pets> <token>`.
5. App mit `?net=mainnet` veröffentlichen.

Prüfen, bevor Schritt 3 passiert: dass Pons Creator-Auszahlungen an eine Contract-Adresse
erlaubt. Falls nicht, eine normale Wallet als Creator eintragen und das ETH von dort
regelmäßig an den Contract weiterleiten.

## Was der Contract nicht kann

- Nichts pausieren, nichts ändern, kein Geld herausnehmen. Es gibt keinen Owner.
- ETH, das ankommt, während kein Tier lebt, wartet auf das erste Tier.
- Physik prüfen muss er nicht mehr. Der einzige Input sind Token-Burns und ETH.
