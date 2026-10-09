// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../SportExchangeInterface.sol";

/**
 * @dev Test helper (thesis, section 6.3)
 *
 * Trades with the exchange and, when it receives ether (the payment of a sale or the
 * refund of a purchase), tries once to call the exchange again. It records whether the
 * nested call succeeded and, if not, the revert reason: with nonReentrant on the
 * exchange it must fail with "ReentrancyGuard: reentrant call".
 */
contract ReentrancyProbe {
    SportExchangeInterface public immutable exchange;
    IERC20 public immutable sprt;
    bool public attempted;
    bool public reentered;
    string public reason;

    constructor(address exchange_, address sprt_) {
        exchange = SportExchangeInterface(exchange_);
        sprt = IERC20(sprt_);
    }

    /// @dev Sells tokens: the exchange pays the ether to this contract
    function sell(uint amount) external {
        sprt.approve(address(exchange), type(uint).max);
        exchange.tokenToEthSwapInput(amount, 1, block.timestamp + 300);
    }

    /// @dev Buys an exact amount of tokens: the exchange refunds the excess ether to this contract
    function buyExact(uint tokens) external payable {
        sprt.approve(address(exchange), type(uint).max);
        exchange.ethToTokenSwapOutput{value: msg.value}(tokens, block.timestamp + 300);
    }

    receive() external payable {
        if (attempted) return;
        attempted = true;
        try exchange.tokenToEthSwapInput(1 ether, 1, block.timestamp + 300) returns (uint) {
            reentered = true;
        } catch Error(string memory r) {
            reason = r;
        } catch {
            reason = "unknown";
        }
    }
}
