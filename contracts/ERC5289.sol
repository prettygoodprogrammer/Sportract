// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IERC5289Library.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @dev Implementation of the ERC-5289 Ethereum Notary Interface
 *
 * Every document is identified by a 16 bit documentId and stores the signer,
 * the timestamp of the signature and an immutable reference to the document,
 * recommended to be hosted on IPFS.
 *
 * A document can be signed only once, and only by the account sending the
 * transaction: a notarized record must never be overwritten.
 */


contract ERC5289 is IERC5289Library {

    /**
     * @dev Data stored for every signed document
     *
     * timeStamp is the timestamp of the block containing the signature,
     * and it is zero for a document never signed.
     */


    struct Document {

        address signer;

        uint timeStamp;

        string ipfsuri;
    }

    // Signed documents, indexed by documentId (up to 65.536 documents)

    mapping (uint16 => Document) private documents;

    // Signer of every document, indexed by documentId

    mapping (uint16 => address) private signers;


    /**
     * @dev The constructor does not need to initialize any state
     *
     */

    constructor () {

    }


    /**
     * @dev Declares the supported interfaces (ERC-165)
     *
     * The standard requires to declare both ERC-5289 and ERC-165.
     */

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {

        return interfaceId == type(IERC5289Library).interfaceId || interfaceId == type(IERC165).interfaceId;

    }

    /// @notice An immutable link to the legal document (RECOMMENDED to be hosted on IPFS). This MUST use a common file format, such as PDF, HTML, TeX, or Markdown.

    function legalDocument(uint16 documentId) public view virtual override returns (string memory) {

        return documents[documentId].ipfsuri;

    }

    /// @notice Returns whether or not the given user signed the document.
    /// @dev The check on timeStamp makes a never signed document result unsigned
    /// for every address, address(0) included.

    function documentSigned(address user, uint16 documentId) public view returns (bool signed) {

        return documents[documentId].timeStamp != 0 && signers[documentId] == user;
    }

    /// @notice Returns when the the given user signed the document.
    /// @dev If the user has not signed the document, the timestamp may be anything.
    /// Here it is zero. The block timestamp (uint256) is converted to the uint64
    /// required by the interface: 2^64 seconds are hundreds of billions of years.

    function documentSignedAt(address user, uint16 documentId) public view returns (uint64 timestamp) {

        return signers[documentId] == user ? uint64(documents[documentId].timeStamp) : 0;

    }

    /**
     * @dev Signs a document storing its IPFS reference
     *
     * Not part of the standard interface: it is the version used by
     * Sportract to notarize every contest with the related document.
     */

    function signDocument(address signer, uint16 documentId, string calldata ipfsuri) public virtual {
        _signDocument(signer, documentId, ipfsuri);
    }


    /// @notice Sign a document
    /// @dev This MUST be validated by the smart contract. This MUST emit DocumentSigned or throw.

    function signDocument(address signer, uint16 documentId) public virtual {
        _signDocument(signer, documentId, "");
    }

    /**
     * @dev Validates and stores a signature
     *
     * Requirements:
     * - the signer must be the account sending the transaction;
     * - the document must not be already signed.
     *
     * Emits DocumentSigned, as required by the standard, and DocumentSignedAt.
     */

    function _signDocument(address signer, uint16 documentId, string memory ipfsuri) internal virtual {

        require(signer == msg.sender, "ERC5289: signer must be the caller");
        require(documents[documentId].timeStamp == 0, "ERC5289: document already signed");

        documents[documentId] = Document(signer, block.timestamp, ipfsuri);
        signers[documentId] = signer;

        emit DocumentSigned(signer, documentId);
        emit DocumentSignedAt(signer, documentId, ipfsuri);

    }


    /// @notice Emitted when signDocument accepts 3 parameters, with the IPFS reference of the document

    event DocumentSignedAt(address indexed signer, uint16 indexed documentId, string uri);

}
