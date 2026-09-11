#!/usr/bin/env python3
"""
Reads a CosmicWatch muon detector over USB serial, signs every accepted hit with the
detector key and relays it to the MuonOracle contract on Robinhood Chain.

    python3 muon_relay.py                 # real detector on SERIAL_PORT
    python3 muon_relay.py --simulate 3    # fake ~3 hits per minute (no hardware)

Every hit, relayed or not, is appended to EVENTS_LOG as one JSON line so the public
event log and the stream overlay can read it.

CosmicWatch line format (firmware v2):
    <event> <ardn_time_ms> <adc 0..1023> <sipm_mV> <deadtime_ms> <temp_C>
"""
import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

ORACLE_ABI = json.loads("""[
 {"inputs":[{"internalType":"uint256","name":"detectorId","type":"uint256"},{"internalType":"uint256","name":"nonce","type":"uint256"},{"internalType":"uint256","name":"timestamp","type":"uint256"},{"internalType":"uint256","name":"adc","type":"uint256"},{"internalType":"uint256","name":"minTokensOut","type":"uint256"},{"internalType":"bytes","name":"signature","type":"bytes"}],"name":"submitDetection","outputs":[{"internalType":"uint256","name":"eventId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
 {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"detectors","outputs":[{"internalType":"bool","name":"active","type":"bool"},{"internalType":"uint256","name":"lastNonce","type":"uint256"},{"internalType":"uint256","name":"acceptedEvents","type":"uint256"}],"stateMutability":"view","type":"function"},
 {"inputs":[],"name":"cooldown","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
 {"inputs":[],"name":"lastAcceptedAt","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
 {"inputs":[],"name":"minAdc","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
 {"inputs":[],"name":"eventCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
]""")

V2_ROUTER_ABI = json.loads("""[
 {"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"address[]","name":"path","type":"address[]"}],"name":"getAmountsOut","outputs":[{"internalType":"uint256[]","name":"amounts","type":"uint256[]"}],"stateMutability":"view","type":"function"}
]""")

VAULT_ABI = json.loads("""[
 {"inputs":[],"name":"nextSpend","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"}
]""")


def env(name, default=None, required=False):
    v = os.getenv(name, default)
    if required and not v:
        sys.exit(f"missing env {name}")
    return v


class Relay:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(env("RPC_URL", required=True)))
        self.chain_id = self.w3.eth.chain_id
        self.oracle_addr = Web3.to_checksum_address(env("ORACLE_ADDRESS", required=True))
        self.oracle = self.w3.eth.contract(address=self.oracle_addr, abi=ORACLE_ABI)
        self.detector_id = int(env("DETECTOR_ID", "1"))
        self.detector = Account.from_key(env("DETECTOR_PRIVATE_KEY", required=True))
        relayer_key = env("RELAYER_PRIVATE_KEY") or env("DETECTOR_PRIVATE_KEY")
        self.relayer = Account.from_key(relayer_key)
        self.min_adc = int(env("MIN_ADC", "0")) or self.oracle.functions.minAdc().call()
        self.local_cooldown = int(env("LOCAL_COOLDOWN", "0"))
        self.log_path = env("EVENTS_LOG", os.path.join(os.path.dirname(__file__), "events.jsonl"))
        self.slippage_bps = int(env("SLIPPAGE_BPS", "300"))
        self.quote = None
        if env("QUOTE_V2_ROUTER") and env("WETH") and env("TOKEN_ADDRESS") and env("VAULT_ADDRESS"):
            self.quote = {
                "router": self.w3.eth.contract(address=Web3.to_checksum_address(env("QUOTE_V2_ROUTER")), abi=V2_ROUTER_ABI),
                "vault": self.w3.eth.contract(address=Web3.to_checksum_address(env("VAULT_ADDRESS")), abi=VAULT_ABI),
                "path": [Web3.to_checksum_address(env("WETH")), Web3.to_checksum_address(env("TOKEN_ADDRESS"))],
            }
        print(f"chain {self.chain_id}  oracle {self.oracle_addr}  detector #{self.detector_id} {self.detector.address}")
        print(f"relayer {self.relayer.address}  minAdc {self.min_adc}  log {self.log_path}")

    # ------------------------------------------------------------ chain helpers

    def next_nonce(self):
        active, last_nonce, _ = self.oracle.functions.detectors(self.detector.address).call()
        if not active:
            sys.exit("detector key is not registered/active on the oracle")
        return last_nonce + 1

    def chain_cooldown_left(self):
        last = self.oracle.functions.lastAcceptedAt().call()
        cd = self.oracle.functions.cooldown().call()
        return max(0, last + cd - int(time.time())) if last else 0

    def min_tokens_out(self):
        """Slippage floor for the buyback. 0 when no quote source is configured."""
        if not self.quote:
            return 0
        try:
            spend = self.quote["vault"].functions.nextSpend().call()
            if spend == 0:
                return 0
            out = self.quote["router"].functions.getAmountsOut(spend, self.quote["path"]).call()[-1]
            return out * (10_000 - self.slippage_bps) // 10_000
        except Exception as e:  # noqa: BLE001
            print(f"quote failed, using 0: {e}")
            return 0

    def sign(self, nonce, timestamp, adc):
        digest = Web3.solidity_keccak(
            ["uint256", "address", "uint256", "uint256", "uint256", "uint256"],
            [self.chain_id, self.oracle_addr, self.detector_id, nonce, timestamp, adc],
        )
        return self.detector.sign_message(encode_defunct(digest)).signature

    def relay(self, timestamp, adc):
        nonce = self.next_nonce()
        sig = self.sign(nonce, timestamp, adc)
        fn = self.oracle.functions.submitDetection(
            self.detector_id, nonce, timestamp, adc, self.min_tokens_out(), sig
        )
        tx = fn.build_transaction({
            "from": self.relayer.address,
            "nonce": self.w3.eth.get_transaction_count(self.relayer.address),
            "chainId": self.chain_id,
        })
        tx["gas"] = int(self.w3.eth.estimate_gas(tx) * 1.3)
        signed = self.relayer.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(h, timeout=180)
        return h.hex(), receipt.status == 1, nonce

    # ------------------------------------------------------------ event loop

    def log(self, record):
        with open(self.log_path, "a") as f:
            f.write(json.dumps(record) + "\n")

    def handle_hit(self, adc, raw):
        ts = int(time.time())
        rec = {"time": datetime.now(timezone.utc).isoformat(), "adc": adc, "raw": raw, "relayed": False}
        if adc < self.min_adc:
            rec["skip"] = "below threshold"
        else:
            left = self.chain_cooldown_left()
            if left > 0:
                rec["skip"] = f"cooldown {left}s"
            else:
                try:
                    tx, ok, nonce = self.relay(ts, adc)
                    rec.update({"relayed": ok, "tx": tx, "nonce": nonce})
                except Exception as e:  # noqa: BLE001
                    rec["error"] = str(e)[:200]
        self.log(rec)
        print(json.dumps(rec))
        if rec.get("relayed") and self.local_cooldown:
            time.sleep(self.local_cooldown)

    def run_serial(self, port, baud):
        import serial  # pyserial

        print(f"listening on {port} @ {baud}")
        with serial.Serial(port, baud, timeout=5) as ser:
            while True:
                line = ser.readline().decode(errors="ignore").strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split()
                if len(parts) < 3 or not parts[2].isdigit():
                    continue  # header or partial line
                self.handle_hit(int(parts[2]), line)

    def run_simulated(self, per_minute):
        print(f"SIMULATION: ~{per_minute} fake hits per minute. Nothing here is a real muon.")
        while True:
            time.sleep(random.expovariate(per_minute / 60.0))
            adc = random.randint(20, 1023)
            self.handle_hit(adc, f"sim {adc}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--simulate", type=float, metavar="HITS_PER_MIN", help="no hardware, emit random hits")
    ap.add_argument("--port", default=env("SERIAL_PORT", "/dev/ttyUSB0"))
    ap.add_argument("--baud", type=int, default=int(env("BAUD", "9600")))
    args = ap.parse_args()

    relay = Relay()
    try:
        if args.simulate:
            relay.run_simulated(args.simulate)
        else:
            relay.run_serial(args.port, args.baud)
    except KeyboardInterrupt:
        print("bye")


if __name__ == "__main__":
    main()
