// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


/**
 * @dev Interface of Sportract, the ERC-20 token of the athlete
 *
 * Lists the functions specific to Sportract: profile of the athlete,
 * parameters of the value rule, registration of the contests and
 * link to the exchange. Every function that modifies the state is
 * restricted to the owner of the contract.
 */

interface SportractInterface is IERC20 {


    /**
     * @dev Emitted when the Exchange is linked
     */

    event ExchangeLinked(address _address);


    // Profile of the athlete

    function setUserData (string calldata _ownername, string calldata _gender, string calldata _country, uint _yearofbirth) external;

    function setName(string calldata _ownername) external;
    function setGender(string calldata _gender) external;
    function setCountry(string calldata _country) external;
    function setYearofbirth(uint _yearofbirth) external;


    // Parameters of the value rule: score bounds and share (in whole tokens)

    function setValueOptions(uint256 _scorelimitup, uint256 _scorelimitdown, uint256 _share) external;


    function getscorelimitup() external view returns (uint256);
    function getscorelimitdown() external view returns (uint256);
    function getShare() external view returns (uint256);


    // Registration of a contest: score (1 to 10), documentId and IPFS reference of the document

    function registerNewContest(uint256 score, uint16 docHash, string calldata ipfsuri) external;

    // Link to the exchange, settable only once

    function setExchangeAddress(address _exchangeaddress) external;



}
