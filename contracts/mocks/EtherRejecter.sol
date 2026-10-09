// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../SportExchangeInterface.sol";

/**
 * @dev Test helper (thesis, section 6.5)
 *
 * A contract without receive() and fallback(): every ether transfer to it fails.
 * It is used as the recipient of a sale and as a liquidity provider, to check that
 * an account refusing ether can only block its own operations, not the others'.
 */
contract EtherRejecter {

    function provideLiquidity(address exchange, address token, uint maxTokens) external payable {
        IERC20(token).approve(exchange, maxTokens);
        SportExchangeInterface(exchange).addLiquidity{value: msg.value}(1, maxTokens, block.timestamp + 300);
    }

    function withdrawLiquidity(address exchange, uint amount) external {
        SportExchangeInterface(exchange).removeLiquidity(amount, 1, 1, block.timestamp + 300);
    }
}
