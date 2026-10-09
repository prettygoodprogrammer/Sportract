// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @dev Contract to collect athletes' performance data
 *
 * This contract provides a storage for the athlete's profile
 * information, such as name, year of birth, country or gender.
 *
 * Moreover, it collects data for every sport event in which the athlete competes,
 * producing value and burning tokens in case of high performances,
 * or inflating value, therefore minting tokens, in case of low performances.
 *
 * The contract is itself the athlete's ERC-20 token (SPRT): the owner of the
 * contract is the athlete, or the entity managing the athlete's profile, and
 * every registered result is notarized through the ERC-5289 interface.
 */




import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


import "./SportractInterface.sol";
import "./ERC5289.sol";

contract Sportract is ERC20, Ownable, ERC5289, SportractInterface  {


    // The following variables store user data
    // Data written on the blockchain is readable by anyone, even if the variables are not public

    string ownername;
    string country;
    string gender;
    uint256 yearofbirth;

    // Index of the total sport events attended

    uint256 private contestIndex;

    // Data structure containing the scores of every event, indexed by contestIndex

    mapping (uint256 => uint256) Contests;


    // The following variables set the bounds that trigger the minting/burning

    uint256 private scorelimitup = 6;
    uint256 private scorelimitdown = 4;

    // Share is the amount of tokens to mint after a low performance,
    // and the minimum balance the owner keeps after a high performance

    uint256 private share;

    // Address of the linked Exchange, set only once with setExchangeAddress

    address private exchange = address(0);

   /**
    * @dev The constructor initializes the contract
    *
    * Sets the name and symbol of the token, the default share (500 tokens)
    * and assigns the initial supply to the account deploying the contract,
    * which becomes the owner.
    */

    constructor(string memory name_, string memory symbol_, uint256 initialSupply)
    ERC20(name_, symbol_) {

        share = 500 * 10 ** decimals();
        _mint(_msgSender(), initialSupply);

    }


   /**
    * @dev Sets the value for ownername, country, gender, yearofbirth
    *
    * Each of these variables is editable in the future,
    * only by the owner of the contract.
    */

    function setUserData (
        string calldata _ownername,
        string calldata _gender,
        string calldata _country,
        uint _yearofbirth
        ) public onlyOwner {
        setName(_ownername);
        setCountry(_country);
        setGender(_gender);
        setYearofbirth(_yearofbirth);
    }


   /**
    * @dev Returns the value of ownername
    *
    */

    function getName() public view returns (string memory) {
        return ownername;
    }

   /**
    * @dev Returns the value of country
    *
    */

    function getCountry() public view returns (string memory) {
        return country;
    }

   /**
    * @dev Returns the value of gender
    *
    */

    function getGender() public view returns (string memory) {
        return gender;
    }

   /**
    * @dev Returns the value of yearofbirth
    *
    */

    function getYearOfBirth() public view returns (uint256) {
        return yearofbirth;
    }

   /**
    * @dev Sets the value for ownername
    *
    * Restricted to the owner, like the other setters: otherwise anyone
    * could bypass setUserData and overwrite the profile (defect D1).
    */

    function setName (string calldata _ownername) public onlyOwner {
        ownername = _ownername;
    }


   /**
    * @dev Sets the value for country
    *
    */

    function setCountry (string calldata _country) public onlyOwner {
        country = _country;
    }


   /**
    * @dev Sets the value for gender
    *
    */

    function setGender (string calldata _gender) public onlyOwner {
        gender = _gender;
    }

   /**
    * @dev Sets the value for yearofbirth
    *
    */

    function setYearofbirth (uint256 _yearofbirth) public onlyOwner {
        yearofbirth = _yearofbirth;
    }


   /**
    * @dev Sets the bounds that trigger burning/minting (1 to 10) and the share
    *
    * Only the owner of the contract is allowed to modify these values.
    * The bounds of the scores, as the scores themselves, are between 1 and 10,
    * and 1 < scorelimitdown < scorelimitup < 10 guarantees that both minting
    * and burning remain reachable. The share is expressed in whole tokens.
    */

    function setValueOptions(uint256 _scorelimitup, uint256 _scorelimitdown, uint256 _share) public onlyOwner {

        // It is required that both bounds are between 1 and 10

        require(_scorelimitup < 10 && _scorelimitdown < _scorelimitup && 1 < _scorelimitdown);

        require(_share > 0);

        scorelimitup = _scorelimitup;
        scorelimitdown = _scorelimitdown;
        share = _share * 10 ** decimals();
    }

    /**
    * @dev Returns the value of scorelimitup
    *
    */

    function getscorelimitup() public view returns (uint256) {
        return scorelimitup;
    }

    /**
    * @dev Returns the value of scorelimitdown
    *
    */

    function getscorelimitdown() public view returns (uint256) {
        return scorelimitdown;
    }

    /**
    * @dev Returns the value of share
    *
    */

    function getShare() public view returns (uint256) {
        return share;
    }


    /**
    * @dev Utility function, returns the minimum between two uint
    *
    */

    function min(uint a, uint b) private pure returns (uint) {
        return a < b ? a : b;
    }

    /**
    * @dev Mints or burns tokens on the owner's balance, based on the score
    *
    * This function compares the value of score with the bounds:
    * if the score is greater than the upper bound, 10% of the owner's balance is burned,
    * without letting the balance fall below share (nothing is burned if the balance
    * is already at or below share);
    * if the score is smaller than the lower bound, share tokens are minted.
    *
    * The rule acts on the owner's balance and not on the reserves of the exchange,
    * so registering a result does not move the price of the pool.
    */

    function scoreValue (uint256 _score) private {

        uint256 b = balanceOf(owner());
        if (_score > scorelimitup) _burn(owner(), (b > share ? min(b/10, b-share) : 0 ));

        if (_score < scorelimitdown) _mint(owner(), share);
    }

    /**
    * @dev Collects and evaluates score data of a new contest, updates the number of events stored
    *
    * The result, the notarization of the related document and the change of supply
    * are recorded in the same transaction: if one of them fails, none is applied.
    */

    function registerNewContest(uint256 score, uint16 docHash, string calldata ipfsuri) public onlyOwner {

        // The score of every game is bounded by the contract between 1 and 10

        require(score > 0 && score < 11);

        Contests[contestIndex] = score;
        contestIndex = contestIndex + 1;

        signDocument(owner(), docHash, ipfsuri);

        scoreValue(score);
    }


    /**
    * @dev Signs a document on behalf of the owner (ERC-5289), with its IPFS reference
    *
    * Restricted to the owner: otherwise a third party could sign a documentId first
    * and prevent the owner from registering that contest (defect D3).
    */

    function signDocument(address signer, uint16 documentId, string calldata ipfsuri) public override onlyOwner {
        super.signDocument(signer, documentId, ipfsuri);
    }

    /**
    * @dev Signs a document without IPFS reference, restricted to the owner as above
    *
    */

    function signDocument(address signer, uint16 documentId) public override onlyOwner {
        super.signDocument(signer, documentId);
    }


    /**
    * @dev Links the contract to its exchange (SportExchange)
    *
    * The address of a contract is known only after its deployment, so the link
    * is set after both deployments. It can be set only once, by the owner,
    * and the address cannot be zero.
    */

    function setExchangeAddress(address _exchangeaddress) public onlyOwner {
        require (exchange == address(0) && _exchangeaddress != address(0));

        exchange = _exchangeaddress;
        emit ExchangeLinked(_exchangeaddress);
    }
}
