#!/usr/bin/env python3
"""Creates a fresh detector key. Put the private key in detector/.env and pass the
address as DETECTOR_SIGNER to scripts/deploy.js (or oracle.registerDetector)."""
from eth_account import Account

acct = Account.create()
print("DETECTOR_PRIVATE_KEY=" + acct.key.hex())
print("DETECTOR_SIGNER=" + acct.address)
