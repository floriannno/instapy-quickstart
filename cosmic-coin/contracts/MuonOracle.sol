// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ICosmicCoin, ICosmicVault} from "./interfaces/ICosmicHooks.sol";

/// @title MuonOracle
/// @notice Accepts signed cosmic-ray detections from registered detectors.
///         Each accepted detection is an on-chain event. The first one launches the token,
///         every later one (subject to a cooldown) triggers a buyback-and-burn in the vault.
///
///         Trust model, stated plainly: a detection is only as honest as the detector key.
///         The contract cannot verify physics. What it does guarantee is that every accepted
///         event is signed by a registered key, cannot be replayed, carries a timestamp the
///         chain considers fresh, and is rate-limited so the vault cannot be drained.
///         Everything else (livestream, open hardware, public event log) lives off-chain.
contract MuonOracle is Ownable2Step {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    struct Detector {
        bool active;
        uint256 lastNonce;
        uint256 acceptedEvents;
    }

    struct Detection {
        uint256 detectorId;
        uint256 timestamp; // detector-side unix time
        uint256 adc;       // raw pulse height from the SiPM, 0..1023
        address signer;
        uint256 blockTime;
    }

    ICosmicCoin public token;
    ICosmicVault public vault;

    /// @notice detectorId => signer address
    mapping(uint256 => address) public detectorSigner;
    mapping(address => Detector) public detectors;

    uint256 public nextDetectorId = 1;
    uint256 public eventCount;
    mapping(uint256 => Detection) public events;

    /// @notice Minimum seconds between two accepted detections (network-wide).
    uint256 public cooldown;
    /// @notice A detection older than this (vs block.timestamp) is rejected.
    uint256 public maxAge;
    /// @notice Pulses below this ADC value are noise, not muons.
    uint256 public minAdc;
    uint256 public lastAcceptedAt;

    event DetectorRegistered(uint256 indexed detectorId, address indexed signer);
    event DetectorDeactivated(uint256 indexed detectorId, address indexed signer);
    event MuonDetected(
        uint256 indexed eventId,
        uint256 indexed detectorId,
        uint256 timestamp,
        uint256 adc,
        bool launchedToken
    );
    event ParamsUpdated(uint256 cooldown, uint256 maxAge, uint256 minAdc);
    event Wired(address token, address vault);

    error UnknownDetector();
    error BadNonce();
    error StaleDetection();
    error FutureDetection();
    error BelowThreshold();
    error CooldownActive();
    error NotWired();
    error AlreadyWired();

    constructor(address owner_, uint256 cooldown_, uint256 maxAge_, uint256 minAdc_)
        Ownable(owner_)
    {
        cooldown = cooldown_;
        maxAge = maxAge_;
        minAdc = minAdc_;
    }

    // ---------------------------------------------------------------- admin

    /// @notice Token and vault are deployed after the oracle (they need its address),
    ///         so they are wired in once here. Cannot be changed afterwards.
    function wire(address token_, address vault_) external onlyOwner {
        if (address(token) != address(0)) revert AlreadyWired();
        token = ICosmicCoin(token_);
        vault = ICosmicVault(vault_);
        emit Wired(token_, vault_);
    }

    function registerDetector(address signer) external onlyOwner returns (uint256 id) {
        id = nextDetectorId++;
        detectorSigner[id] = signer;
        detectors[signer] = Detector({active: true, lastNonce: 0, acceptedEvents: 0});
        emit DetectorRegistered(id, signer);
    }

    function deactivateDetector(uint256 id) external onlyOwner {
        address signer = detectorSigner[id];
        detectors[signer].active = false;
        emit DetectorDeactivated(id, signer);
    }

    function setParams(uint256 cooldown_, uint256 maxAge_, uint256 minAdc_) external onlyOwner {
        cooldown = cooldown_;
        maxAge = maxAge_;
        minAdc = minAdc_;
        emit ParamsUpdated(cooldown_, maxAge_, minAdc_);
    }

    // ---------------------------------------------------------------- detections

    /// @notice Hash the detector signs (EIP-191 personal_sign over this digest).
    function detectionDigest(uint256 detectorId, uint256 nonce, uint256 timestamp, uint256 adc)
        public
        view
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(block.chainid, address(this), detectorId, nonce, timestamp, adc))
            .toEthSignedMessageHash();
    }

    /// @notice Anyone may relay a detection; the signature is what matters.
    /// @param minTokensOut Slippage floor for the buyback swap, computed by the relayer.
    function submitDetection(
        uint256 detectorId,
        uint256 nonce,
        uint256 timestamp,
        uint256 adc,
        uint256 minTokensOut,
        bytes calldata signature
    ) external returns (uint256 eventId) {
        if (address(token) == address(0)) revert NotWired();

        address signer = detectionDigest(detectorId, nonce, timestamp, adc).recover(signature);
        Detector storage d = detectors[signer];
        if (!d.active || detectorSigner[detectorId] != signer) revert UnknownDetector();
        if (nonce != d.lastNonce + 1) revert BadNonce();
        if (adc < minAdc) revert BelowThreshold();
        if (timestamp > block.timestamp + 120) revert FutureDetection();
        if (timestamp + maxAge < block.timestamp) revert StaleDetection();
        if (lastAcceptedAt != 0 && block.timestamp < lastAcceptedAt + cooldown) revert CooldownActive();

        d.lastNonce = nonce;
        d.acceptedEvents += 1;
        lastAcceptedAt = block.timestamp;

        eventId = ++eventCount;
        events[eventId] = Detection({
            detectorId: detectorId,
            timestamp: timestamp,
            adc: adc,
            signer: signer,
            blockTime: block.timestamp
        });

        bool launched = false;
        if (!token.tradingEnabled()) {
            token.launch(eventId);
            launched = true;
        } else {
            vault.onDetection(eventId, minTokensOut);
        }

        emit MuonDetected(eventId, detectorId, timestamp, adc, launched);
    }
}
