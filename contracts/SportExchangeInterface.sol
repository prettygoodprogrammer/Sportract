// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Interface of SportExchange, the ETH/SPRT market maker derived from Uniswap V1
 *
 * The exchange is itself an ERC-20 token (SPRT-LP) representing the shares of the pool.
 * Compared to Uniswap V1 there is no factory, and the joint deposit athlete-sponsor is added.
 * Every function that moves funds takes a deadline, as in V1.
 */
interface SportExchangeInterface is IERC20 {

    // ----------------------------------------------------------------- events

    /// Emitted when liquidity is provided with addLiquidity
    event AddLiquidity(address indexed provider, uint eth_amount, uint token_amount);

    /// Emitted when liquidity is withdrawn with removeLiquidity
    event RemoveLiquidity(address indexed provider, uint eth_amount, uint token_amount);

    /// Emitted when tokens are bought with ether
    event TokenPurchase(address indexed buyer, uint eth_sold, uint tokens_bought);

    /// Emitted when tokens are sold for ether
    event EthPurchase(address indexed buyer, uint tokens_sold, uint eth_bought);

    /// Emitted when the athlete registers (or revokes, with maxTokens = 0) an offer for a sponsor
    event SponsorshipOffered(address indexed sponsor, uint maxTokens);

    /// Emitted on a joint deposit: tokens from the athlete, ether from the sponsor, shares split between them
    event SponsorLiquidity(address indexed sponsor, address indexed athlete,
                           uint eth_amount, uint token_amount, uint liquidity);

    // ----------------------------------------------------------------- data

    /// Address of the Sportract token
    function token() external view returns (address);

    /// The athlete is the current owner of Sportract
    function athlete() external view returns (address);

    /// Tokens still available in the offer addressed to a sponsor
    function sponsorOffer(address sponsor) external view returns (uint);

    // ----------------------------------------------------------------- liquidity

    function addLiquidity(uint min_liquidity, uint max_tokens, uint deadline) external payable returns (uint);

    function removeLiquidity(uint amount, uint min_eth, uint min_tokens, uint deadline) external returns (uint, uint);

    function offerSponsorship(address sponsor, uint maxTokens) external;

    function sponsorLiquidity(uint min_liquidity, uint deadline) external payable returns (uint);

    // ----------------------------------------------------------------- prices

    function getEthToTokenInputPrice(uint eth_sold) external view returns (uint tokens_bought);

    function getEthToTokenOutputPrice(uint tokens_bought) external view returns (uint eth_sold);

    function getTokenToEthInputPrice(uint tokens_sold) external view returns (uint eth_bought);

    function getTokenToEthOutputPrice(uint eth_bought) external view returns (uint tokens_sold);

    // ----------------------------------------------------------------- ETH -> SPRT

    function ethToTokenSwapInput(uint min_tokens, uint deadline) external payable returns (uint tokens_bought);

    function ethToTokenTransferInput(uint min_tokens, uint deadline, address recipient) external payable returns (uint tokens_bought);

    function ethToTokenSwapOutput(uint tokens_bought, uint deadline) external payable returns (uint eth_sold);

    function ethToTokenTransferOutput(uint tokens_bought, uint deadline, address recipient) external payable returns (uint eth_sold);

    // ----------------------------------------------------------------- SPRT -> ETH

    function tokenToEthSwapInput(uint tokens_sold, uint min_eth, uint deadline) external returns (uint eth_bought);

    function tokenToEthTransferInput(uint tokens_sold, uint min_eth, uint deadline, address payable recipient) external returns (uint eth_bought);

    function tokenToEthSwapOutput(uint eth_bought, uint max_tokens, uint deadline) external returns (uint tokens_sold);

    function tokenToEthTransferOutput(uint eth_bought, uint max_tokens, uint deadline, address payable recipient) external returns (uint tokens_sold);
}
