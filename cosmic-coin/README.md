# CosmicCoin (MUON)

Ein Memecoin auf Robinhood Chain, dessen Launch und jeder spätere Buyback von einem
echten Teilchen aus dem Weltall ausgelöst wird. Kein Gehirn, kein Organismus, Physik.

**Ein-Satz-Story:** Jeder Buyback wird von einem Myon ausgelöst, das vor Millionen
Jahren in einer Supernova entstanden ist und gerade durch unseren Detektor geflogen ist.

## Wie es funktioniert

```
CosmicWatch-Detektor ──USB──▶ muon_relay.py ──signierte Detektion──▶ MuonOracle
                                                                        │
                                              erstes Event: launch() ◀──┤
                                              jedes weitere: onDetection()
                                                                        ▼
                                                                   CosmicVault
                                                                 ETH ─▶ DEX ─▶ MUON ─▶ burn
```

1. **Detektor.** [CosmicWatch](http://cosmicwatch.lns.mit.edu/) ist ein Open-Source-
   Myonendetektor vom MIT, Bauteile etwa 100 Euro. Er registriert mehrere Treffer pro
   Minute. Jeder Treffer kommt als Zeile über USB-Serial.
2. **Relay.** `detector/muon_relay.py` liest die Zeile, signiert `(chainId, oracle,
   detectorId, nonce, timestamp, adc)` mit dem Detektor-Key und sendet die Transaktion.
   Jeder Treffer, auch die nicht gesendeten, landet in `events.jsonl` für Stream-Overlay
   und öffentliches Log.
3. **MuonOracle.** Prüft Signatur, Nonce (kein Replay), Alter (kein Nachreichen),
   ADC-Schwelle (kein Rauschen) und einen netzweiten Cooldown (kein Leerlaufen des Vaults).
   Das erste akzeptierte Event schaltet den Handel frei. Jedes weitere ruft den Vault.
4. **CosmicVault.** Hält ETH (Creator-Rewards vom Launchpad, Spenden). Pro Event wird ein
   gedeckelter Anteil in MUON getauscht und verbrannt. **Es gibt keine Withdraw-Funktion.**
   ETH verlässt den Vault nur über ein Teilchen.
5. **CosmicCoin.** ERC-20, feste Menge, kein Mint, keine Tax, keine Blacklist, kein Owner.

## Tokenomics (im Contract festgeschrieben)

| Anteil | Empfänger | Bedingung |
|---|---|---|
| 80 % | Launch-Wallet | wird komplett in den öffentlichen Pool gelegt (bei pools.trade dauerhaft gelockt) |
| 10 % | Team | VestingWallet, linear über 12 Monate |
| 10 % | Detektor-Netzwerk | VestingWallet, linear über 12 Monate, für Holder, die später eigene Detektoren betreiben |

Gesamtmenge 1.000.000.000 MUON. Alles im Constructor gemintet, danach nie wieder.

## Was der Contract garantiert und was nicht

Ehrlich gesagt: Der Contract kann keine Physik prüfen. Eine Detektion ist so ehrlich wie
der Detektor-Key. Was der Contract garantiert:

- jedes Event ist von einem registrierten Key signiert
- kein Event kann zweimal eingereicht werden (Nonce)
- kein Event kann auf Vorrat gesammelt und später eingereicht werden (maxAge)
- der Vault kann pro Event höchstens `min(spendBps · Balance, maxSpendPerEvent)` ausgeben
- zwischen zwei Events liegt mindestens `cooldown`

Der Rest ist Transparenz: Livestream des Detektors, öffentliches `events.jsonl`, offener
Code. Später können weitere Detektoren registriert werden, bis hin zu einem Netzwerk
bei Holdern.

## Setup

```bash
cd cosmic-coin
npm install
npx hardhat test           # 11 Tests
cp .env.example .env       # ausfüllen
```

Der Solidity-Compiler wird aus `node_modules/solc` genommen, kein Download nötig.

### Detektor-Key erzeugen

```bash
pip3 install -r detector/requirements.txt
python3 detector/keygen.py
```

Den Private Key in `detector/.env` eintragen, die Adresse als `DETECTOR_SIGNER` in `.env`.

### Deploy auf das Testnet

```bash
npx hardhat run scripts/deploy.js --network robinhoodTestnet
```

Schreibt `deployments/robinhoodTestnet.json`. Danach:

1. Pool mit den 80 % aus der Launch-Wallet anlegen (Uniswap oder pools.trade).
2. `WETH` und Router-Adresse in `.env` eintragen, dann
   `npx hardhat run scripts/set-executor.js --network robinhoodTestnet`.
3. ETH an die Vault-Adresse schicken.
4. Relay starten.

### Relay starten

```bash
cd detector && cp .env.example .env    # ORACLE_ADDRESS, DETECTOR_PRIVATE_KEY, RPC_URL
python3 -u muon_relay.py               # echter Detektor an /dev/ttyUSB0
python3 -u muon_relay.py --simulate 3  # ohne Hardware, ~3 Fake-Treffer pro Minute
```

Der Simulationsmodus ist nur zum Testen. Er darf nie gegen den Mainnet-Oracle laufen,
sonst ist die gesamte Story wertlos.

## Netzwerke

| Netz | Chain ID | RPC | Explorer |
|---|---|---|---|
| Testnet | 46630 | https://rpc.testnet.chain.robinhood.com | https://explorer.testnet.chain.robinhood.com |
| Mainnet | 4663 | https://rpc.mainnet.chain.robinhood.com | https://robinhoodchain.blockscout.com |

Router- und WETH-Adressen für Uniswap auf Robinhood Chain vor dem Mainnet-Deploy im
Explorer bzw. in der Uniswap-Doku nachschlagen und in `.env` eintragen.

## Parameter, die vor dem Launch kalibriert werden müssen

| Parameter | Wo | Default | Hinweis |
|---|---|---|---|
| `MIN_ADC` | deploy.js | 100 | Rauschgrenze des konkreten Detektors, einen Tag lang messen |
| `COOLDOWN` | deploy.js | 15 min | bestimmt, wie viele Buybacks pro Tag maximal passieren |
| `SPEND_BPS` / `MAX_SPEND` | deploy.js | 2 % / 0,05 ETH | Vault-Budget pro Event |
| `EMERGENCY_DELAY` | deploy.js | 14 Tage | Notausgang, falls der Detektor vor dem ersten Treffer stirbt |

## Story-Bogen

1. Detektor-Bau im Livestream, Contract-Adressen vorher veröffentlicht.
2. Countdown. Der erste Treffer nach dem Countdown launcht den Coin, sichtbar im Explorer.
3. Jeder Buyback als Post: Zeitstempel, ADC-Wert, Tx-Hash, verbrannte Menge.
4. Weitere Detektoren bei Holdern registrieren, „das Universum hält den Coin am Leben".

## Rechtliches

Team-Wallet, Vesting und Vault sind öffentlich und im Contract nachlesbar. Keine
versteckten Wallets, keine verdeckten Käufe. Wer das Projekt aus der EU heraus betreibt,
sollte MiCA (Artikel 86 bis 92, Marktmissbrauch) kennen und ein Whitepaper nach Artikel 6
prüfen lassen, sobald der Coin öffentlich angeboten wird.
