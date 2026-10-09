// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Test helper (thesis, section 6.7)
 *
 * Transfers its balance to an address through selfdestruct, without executing
 * any function of the recipient: the exchange receives ether outside receive().
 */
contract ForceSend {
    constructor() payable {}

    function forceSend(address payable target) external {
        selfdestruct(target);
    }
}
