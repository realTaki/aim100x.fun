// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LonelyUSD
/// @notice Testnet 6-decimal ERC-20 (`LUSD`). OpenZeppelin ERC20 + faucet / minter.
///         Minter is Grokbot (`PAYMASTER_SIGNER` / `GROKBOT_WEB3_WALLET`).
contract LonelyUSD is ERC20 {
    error Unauthorized();
    error InvalidRecipient();
    error Cooldown();

    event MinterSet(address indexed minter);

    uint256 public constant FAUCET_AMOUNT = 100_000_000;
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    address public minter;
    mapping(address account => uint256) public lastFaucetAt;

    constructor(address minter_) ERC20("LonelyUSD", "LUSD") {
        if (minter_ == address(0)) revert InvalidRecipient();
        minter = minter_;
        emit MinterSet(minter_);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucetReadyAt(address account) public view returns (uint256) {
        uint256 last = lastFaucetAt[account];
        if (last == 0) return 0;
        return last + FAUCET_COOLDOWN;
    }

    /// @notice Mint 100 LUSD to `msg.sender`. Cooldown is the caller (smart account).
    function faucet() external {
        uint256 readyAt = faucetReadyAt(msg.sender);
        if (readyAt != 0 && block.timestamp < readyAt) revert Cooldown();
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert Unauthorized();
        _mint(to, amount);
    }
}
