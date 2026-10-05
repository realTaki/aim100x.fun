// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntryPoint, IPaymaster, UserOperation} from "./UserOperation.sol";
import {PasskeyAccountFactory} from "./PasskeyAccountFactory.sol";

/// @notice Sponsors UserOps from PasskeyAccountFactory accounts. Funded by the deployer EOA (gas only).
contract PasskeyPaymaster is IPaymaster {
    IEntryPoint public immutable entryPoint;
    PasskeyAccountFactory public immutable factory;
    address public owner;
    /// @dev Pimlico's simulated maxCost on Monad is above gas×fee (often >1 MON).
    uint256 public maxCostWei = 50 ether;

    error NotEntryPoint();
    error Unauthorized();
    error Rejected();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MaxCostSet(uint256 maxCostWei);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(IEntryPoint entryPoint_, PasskeyAccountFactory factory_) {
        entryPoint = entryPoint_;
        factory = factory_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert Unauthorized();
        emit OwnershipTransferred(owner, next);
        owner = next;
    }

    function setMaxCost(uint256 next) external onlyOwner {
        maxCostWei = next;
        emit MaxCostSet(next);
    }

    function deposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    function withdrawStake(address payable to) external onlyOwner {
        entryPoint.withdrawStake(to);
    }

    function withdrawTo(address payable to, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32,
        uint256 maxCost
    ) external view returns (bytes memory context, uint256 validationData) {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();
        if (maxCost > maxCostWei) revert Rejected();
        if (userOp.initCode.length >= 20) {
            address initFactory = address(bytes20(userOp.initCode[0:20]));
            if (initFactory != address(factory)) revert Rejected();
        }
        if (!factory.isAccount(userOp.sender)) revert Rejected();
        return ("", 0);
    }

    function postOp(PostOpMode, bytes calldata, uint256) external view {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();
    }
}
