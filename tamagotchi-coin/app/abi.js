export const PETS_ABI = [
  "function pets(address) view returns (bool alive, uint8 stage, uint64 bornAt, uint64 lastFed, uint128 burned, uint256 rewardDebt, uint256 owed, uint32 generation)",
  "function deadline(address) view returns (uint256)",
  "function isExpired(address) view returns (bool)",
  "function pending(address) view returns (uint256)",
  "function stageThreshold(uint8) pure returns (uint256)",
  "function stageTimer(uint8) pure returns (uint256)",
  "function FEED_COST() view returns (uint256)",
  "function livingPets() view returns (uint256)",
  "function totalDeaths() view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function hatch()",
  "function feed()",
  "function claim()",
  "function kill(address)",
  "event Fed(address indexed owner, uint256 burned, uint8 stage, uint64 nextDeadline)",
  "event Died(address indexed owner, address indexed reporter, uint8 stage, uint256 ageSeconds, uint256 legacy)",
];
export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function faucet()",
];
