// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./SportExchangeInterface.sol";

/**
 * @title SportExchange
 * @dev Constant product market maker for the ETH/SPRT pair
 *
 * Solidity 0.8 translation of the Uniswap V1 exchange contract (uniswap_exchange.vy);
 * the comments "V1 l. N" point to the corresponding lines of the Vyper source.
 * The contract is itself an ERC-20 token (SPRT-LP) representing the shares of the pool.
 *
 * Differences from V1, marked with [Sportract]:
 *  - no factory and no token-to-token functions (a single token);
 *  - joint deposit athlete-sponsor (offerSponsorship, sponsorLiquidity);
 *  - ether sent with call instead of send, hence checks-effects-interactions order
 *    and ReentrancyGuard (in V1 the 2,300 gas stipend of send prevented re-entering);
 *  - initial liquidity computed on msg.value instead of the balance of the contract.
 */
contract SportExchange is SportExchangeInterface, ERC20, ReentrancyGuard {

    IERC20 private immutable sportract;

    // [Sportract] tokens still withdrawable from the athlete's balance, for each sponsor
    mapping(address => uint256) private _sponsorOffers;

    constructor(string memory name_, string memory symbol_, address _sportractaddress)
        ERC20(name_, symbol_)
    {
        require(_sportractaddress != address(0), "SportExchange: zero address");
        sportract = IERC20(_sportractaddress);
    }

    // =====================================================================================
    // Data
    // =====================================================================================

    /// @notice Address of the Sportract token (V1 l. 456: tokenAddress)
    function token() external view returns (address) {
        return address(sportract);
    }

    /// @notice [Sportract] The athlete is the current owner of Sportract
    function athlete() public view returns (address) {
        return Ownable(address(sportract)).owner();
    }

    /// @notice [Sportract] Tokens still available in the offer addressed to a sponsor
    function sponsorOffer(address sponsor) external view returns (uint) {
        return _sponsorOffers[sponsor];
    }

    // =====================================================================================
    // Liquidity (V1 l. 48-101)
    // =====================================================================================

    /**
     * @notice Deposits ETH and SPRT at the current ratio and mints SPRT-LP shares.
     * @param min_liquidity Minimum shares to receive (ignored on the first deposit).
     * @param max_tokens Maximum tokens to deposit; on the first deposit, tokens deposited.
     * @param deadline Time after which this transaction can no longer be executed.
     */
    function addLiquidity(uint min_liquidity, uint max_tokens, uint deadline)
        external payable nonReentrant returns (uint)
    {
        require(deadline > block.timestamp && max_tokens > 0 && msg.value > 0,           // V1 l. 49
                "SportExchange: invalid input");
        uint total_liquidity = totalSupply();

        if (total_liquidity > 0) {
            require(min_liquidity > 0, "SportExchange: min_liquidity");                   // V1 l. 52
            uint eth_reserve = address(this).balance - msg.value;
            uint token_reserve = sportract.balanceOf(address(this));
            uint token_amount = msg.value * token_reserve / eth_reserve + 1;              // V1 l. 55: +1 in favour of the pool
            uint liquidity_minted = msg.value * total_liquidity / eth_reserve;
            require(max_tokens >= token_amount && liquidity_minted >= min_liquidity,
                    "SportExchange: slippage");
            _mint(msg.sender, liquidity_minted);
            require(sportract.transferFrom(msg.sender, address(this), token_amount));
            emit AddLiquidity(msg.sender, msg.value, token_amount);
            return liquidity_minted;
        } else {
            require(msg.value >= 1000000000, "SportExchange: min 1 gwei");                // V1 l. 65
            uint token_amount = max_tokens;
            uint initial_liquidity = msg.value;                                           // V1 l. 68: [Sportract] msg.value, not the balance
            _mint(msg.sender, initial_liquidity);
            require(sportract.transferFrom(msg.sender, address(this), token_amount));
            emit AddLiquidity(msg.sender, msg.value, token_amount);
            return initial_liquidity;
        }
    }

    /**
     * @notice Burns SPRT-LP shares to withdraw ETH and SPRT at the current ratio.
     * @return The amount of ETH and tokens withdrawn.
     */
    function removeLiquidity(uint amount, uint min_eth, uint min_tokens, uint deadline)
        external nonReentrant returns (uint, uint)
    {
        require(amount > 0 && deadline > block.timestamp && min_eth > 0 && min_tokens > 0, // V1 l. 84
                "SportExchange: invalid input");
        uint total_liquidity = totalSupply();
        require(total_liquidity > 0, "SportExchange: empty pool");
        uint token_reserve = sportract.balanceOf(address(this));
        uint eth_amount = amount * address(this).balance / total_liquidity;
        uint token_amount = amount * token_reserve / total_liquidity;
        require(eth_amount >= min_eth && token_amount >= min_tokens, "SportExchange: slippage");

        _burn(msg.sender, amount);                                                        // effects
        require(sportract.transfer(msg.sender, token_amount));                            // V1 l. 93-94, order inverted
        _sendEth(payable(msg.sender), eth_amount);
        emit RemoveLiquidity(msg.sender, eth_amount, token_amount);
        return (eth_amount, token_amount);
    }

    // =====================================================================================
    // [Sportract] Joint deposit: tokens from the athlete, ether from the sponsor
    // =====================================================================================

    /**
     * @notice The athlete allows a sponsor to deposit up to maxTokens of the athlete's tokens.
     * @dev Requires also approve(exchange, n) on Sportract. maxTokens = 0 revokes the offer.
     */
    function offerSponsorship(address sponsor, uint maxTokens) external {
        require(msg.sender == athlete(), "SportExchange: caller is not the athlete");
        require(sponsor != address(0) && sponsor != msg.sender, "SportExchange: invalid sponsor");
        _sponsorOffers[sponsor] = maxTokens;
        emit SponsorshipOffered(sponsor, maxTokens);
    }

    /**
     * @notice The sponsor sends ether; the matching tokens are taken from the athlete and the
     * minted shares are split in half between the two (the odd unit goes to the sponsor).
     * @dev Same formulas as addLiquidity; on the first deposit the offer sets the price.
     * The checks on offer, allowance and balance make a failing deposit revert, so the
     * ether is returned to the sponsor.
     */
    function sponsorLiquidity(uint min_liquidity, uint deadline)
        external payable nonReentrant returns (uint)
    {
        require(deadline > block.timestamp && msg.value > 0, "SportExchange: invalid input");
        address sponsor = msg.sender;
        address athleteAddr = athlete();
        uint offer = _sponsorOffers[sponsor];
        require(offer > 0, "SportExchange: no offer for sponsor");

        uint total_liquidity = totalSupply();
        uint token_amount;
        uint liquidity_minted;
        if (total_liquidity > 0) {
            uint eth_reserve = address(this).balance - msg.value;
            token_amount = msg.value * sportract.balanceOf(address(this)) / eth_reserve + 1;
            liquidity_minted = msg.value * total_liquidity / eth_reserve;
        } else {
            require(msg.value >= 1000000000, "SportExchange: min 1 gwei");
            token_amount = offer;
            liquidity_minted = msg.value;
        }
        require(liquidity_minted >= min_liquidity, "SportExchange: slippage");
        require(token_amount <= offer, "SportExchange: offer exceeded");
        require(token_amount <= sportract.allowance(athleteAddr, address(this)), "SportExchange: allowance too low");
        require(token_amount <= sportract.balanceOf(athleteAddr), "SportExchange: athlete balance too low");

        _sponsorOffers[sponsor] = offer - token_amount;                                   // effects
        uint athlete_share = liquidity_minted / 2;
        _mint(sponsor, liquidity_minted - athlete_share);
        _mint(athleteAddr, athlete_share);
        require(sportract.transferFrom(athleteAddr, address(this), token_amount));        // interaction
        emit SponsorLiquidity(sponsor, athleteAddr, msg.value, token_amount, liquidity_minted);
        return liquidity_minted;
    }

    // =====================================================================================
    // Pricing functions (V1 l. 106-125)
    // =====================================================================================

    /// @dev Output for a fixed input, with a 0.3% fee on the input
    function _getInputPrice(uint input_amount, uint input_reserve, uint output_reserve)
        private pure returns (uint)
    {
        require(input_reserve > 0 && output_reserve > 0, "SportExchange: empty reserve");
        uint input_amount_with_fee = input_amount * 997;
        uint numerator = input_amount_with_fee * output_reserve;
        uint denominator = input_reserve * 1000 + input_amount_with_fee;
        return numerator / denominator;
    }

    /// @dev Input needed for a fixed output, rounded up by 1 in favour of the pool
    function _getOutputPrice(uint output_amount, uint input_reserve, uint output_reserve)
        private pure returns (uint)
    {
        require(input_reserve > 0 && output_reserve > 0, "SportExchange: empty reserve");
        uint numerator = input_reserve * output_amount * 1000;
        uint denominator = (output_reserve - output_amount) * 997;
        return numerator / denominator + 1;
    }

    // V1 l. 416-451
    function getEthToTokenInputPrice(uint eth_sold) external view returns (uint) {
        require(eth_sold > 0);
        return _getInputPrice(eth_sold, address(this).balance, sportract.balanceOf(address(this)));
    }

    function getEthToTokenOutputPrice(uint tokens_bought) external view returns (uint) {
        require(tokens_bought > 0);
        return _getOutputPrice(tokens_bought, address(this).balance, sportract.balanceOf(address(this)));
    }

    function getTokenToEthInputPrice(uint tokens_sold) external view returns (uint) {
        require(tokens_sold > 0);
        return _getInputPrice(tokens_sold, sportract.balanceOf(address(this)), address(this).balance);
    }

    function getTokenToEthOutputPrice(uint eth_bought) external view returns (uint) {
        require(eth_bought > 0);
        return _getOutputPrice(eth_bought, sportract.balanceOf(address(this)), address(this).balance);
    }

    // =====================================================================================
    // ETH to SPRT (V1 l. 127-200)
    // =====================================================================================

    // V1 l. 127-135
    function _ethToTokenInput(uint eth_sold, uint min_tokens, uint deadline, address buyer, address recipient)
        private returns (uint)
    {
        require(deadline >= block.timestamp && eth_sold > 0 && min_tokens > 0, "SportExchange: invalid input");
        uint token_reserve = sportract.balanceOf(address(this));
        uint tokens_bought = _getInputPrice(eth_sold, address(this).balance - eth_sold, token_reserve);
        require(tokens_bought >= min_tokens, "SportExchange: slippage");
        require(sportract.transfer(recipient, tokens_bought));                            // V1 l. 132
        emit TokenPurchase(buyer, eth_sold, tokens_bought);
        return tokens_bought;
    }

    // V1 l. 167-177
    function _ethToTokenOutput(uint tokens_bought, uint max_eth, uint deadline, address buyer, address recipient)
        private returns (uint)
    {
        require(deadline >= block.timestamp && tokens_bought > 0 && max_eth > 0, "SportExchange: invalid input");
        uint token_reserve = sportract.balanceOf(address(this));
        uint eth_sold = _getOutputPrice(tokens_bought, address(this).balance - max_eth, token_reserve);
        uint eth_refund = max_eth - eth_sold;            // V1 l. 171-172: reverts (underflow) if eth_sold > max_eth
        require(sportract.transfer(recipient, tokens_bought));                            // V1 l. 175
        if (eth_refund > 0) _sendEth(payable(buyer), eth_refund);                         // V1 l. 173-174, after the transfer
        emit TokenPurchase(buyer, eth_sold, tokens_bought);
        return eth_sold;
    }

    /// @notice Ether sent directly buys tokens at the current price (V1 l. 141: __default__)
    receive() external payable nonReentrant {
        _ethToTokenInput(msg.value, 1, block.timestamp, msg.sender, msg.sender);
    }

    function ethToTokenSwapInput(uint min_tokens, uint deadline)
        external payable nonReentrant returns (uint)
    {
        return _ethToTokenInput(msg.value, min_tokens, deadline, msg.sender, msg.sender);
    }

    function ethToTokenTransferInput(uint min_tokens, uint deadline, address recipient)
        external payable nonReentrant returns (uint)
    {
        require(recipient != address(this) && recipient != address(0), "SportExchange: invalid recipient");
        return _ethToTokenInput(msg.value, min_tokens, deadline, msg.sender, recipient);
    }

    function ethToTokenSwapOutput(uint tokens_bought, uint deadline)
        external payable nonReentrant returns (uint)
    {
        return _ethToTokenOutput(tokens_bought, msg.value, deadline, msg.sender, msg.sender);
    }

    function ethToTokenTransferOutput(uint tokens_bought, uint deadline, address recipient)
        external payable nonReentrant returns (uint)
    {
        require(recipient != address(this) && recipient != address(0), "SportExchange: invalid recipient");
        return _ethToTokenOutput(tokens_bought, msg.value, deadline, msg.sender, recipient);
    }

    // =====================================================================================
    // SPRT to ETH (V1 l. 202-269)
    // =====================================================================================

    // V1 l. 202-211
    function _tokenToEthInput(uint tokens_sold, uint min_eth, uint deadline, address buyer, address payable recipient)
        private returns (uint)
    {
        require(deadline >= block.timestamp && tokens_sold > 0 && min_eth > 0, "SportExchange: invalid input");
        uint token_reserve = sportract.balanceOf(address(this));
        uint eth_bought = _getInputPrice(tokens_sold, token_reserve, address(this).balance);
        require(eth_bought >= min_eth, "SportExchange: slippage");
        require(sportract.transferFrom(buyer, address(this), tokens_sold));              // V1 l. 208-209, order inverted
        _sendEth(recipient, eth_bought);
        emit EthPurchase(buyer, tokens_sold, eth_bought);
        return eth_bought;
    }

    // V1 l. 237-246
    function _tokenToEthOutput(uint eth_bought, uint max_tokens, uint deadline, address buyer, address payable recipient)
        private returns (uint)
    {
        require(deadline >= block.timestamp && eth_bought > 0, "SportExchange: invalid input");   // V1 l. 238
        uint token_reserve = sportract.balanceOf(address(this));
        uint tokens_sold = _getOutputPrice(eth_bought, token_reserve, address(this).balance);
        require(max_tokens >= tokens_sold, "SportExchange: slippage");
        require(sportract.transferFrom(buyer, address(this), tokens_sold));              // V1 l. 243-244, order inverted
        _sendEth(recipient, eth_bought);
        emit EthPurchase(buyer, tokens_sold, eth_bought);
        return tokens_sold;
    }

    function tokenToEthSwapInput(uint tokens_sold, uint min_eth, uint deadline)
        external nonReentrant returns (uint)
    {
        return _tokenToEthInput(tokens_sold, min_eth, deadline, msg.sender, payable(msg.sender));
    }

    function tokenToEthTransferInput(uint tokens_sold, uint min_eth, uint deadline, address payable recipient)
        external nonReentrant returns (uint)
    {
        require(recipient != address(this) && recipient != address(0), "SportExchange: invalid recipient");
        return _tokenToEthInput(tokens_sold, min_eth, deadline, msg.sender, recipient);
    }

    function tokenToEthSwapOutput(uint eth_bought, uint max_tokens, uint deadline)
        external nonReentrant returns (uint)
    {
        return _tokenToEthOutput(eth_bought, max_tokens, deadline, msg.sender, payable(msg.sender));
    }

    function tokenToEthTransferOutput(uint eth_bought, uint max_tokens, uint deadline, address payable recipient)
        external nonReentrant returns (uint)
    {
        require(recipient != address(this) && recipient != address(0), "SportExchange: invalid recipient");
        return _tokenToEthOutput(eth_bought, max_tokens, deadline, msg.sender, recipient);
    }

    // =====================================================================================
    // Utilities
    // =====================================================================================

    /// @dev [Sportract] Sends ether with call (all gas forwarded), always as the last step
    function _sendEth(address payable to, uint amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "SportExchange: ETH transfer failed");
    }
}
