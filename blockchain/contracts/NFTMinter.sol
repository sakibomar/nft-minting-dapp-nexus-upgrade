// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ============================================================
// NFTMinter Smart Contract - CN6035 Coursework (Upgraded)
// ============================================================
// Features:
//   * Mint NFTs with metadata URI and custom royalty percentage
//   * ERC-2981 royalty standard - creators earn on every resale
//   * Burn - owners can permanently destroy their NFTs
//   * Full ERC-721 compliance with URI storage
//   * Pausable - emergency stop for minting and burning
// ============================================================

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTMinter
 * @author CN6035 Coursework
 * @notice Mint, burn, and trade NFTs with built-in ERC-2981 royalties.
 *         Contract owner can pause/unpause as an emergency stop.
 */
contract NFTMinter is ERC721URIStorage, ERC2981, Ownable, Pausable {
    // --- State Variables ---

    uint256 private _nextTokenId;
    uint256 public maxSupply = 100;
    uint256 public mintPrice = 0.01 ether;
    uint256 private _burnedCount;

    mapping(uint256 => address) private _creators;

    // --- Events ---

    event NFTMinted(
        uint256 indexed tokenId,
        address indexed minter,
        string tokenURI
    );

    event NFTBurned(
        uint256 indexed tokenId,
        address indexed burner
    );

    // --- Constructor ---

    constructor()
        ERC721("CN6035 NFT Collection", "CN6035NFT")
        Ownable(msg.sender)
    {
        // Set a default royalty of 10% for the collection (can be overridden per token)
        _setDefaultRoyalty(msg.sender, 1000);
    }

    // --- Minting ---

    /**
     * @notice Mint a new NFT with metadata URI and royalty percentage.
     * @param _tokenURI  IPFS or HTTP URI pointing to token metadata JSON.
     * @param _royaltyBps Royalty in basis points (e.g. 1000 = 10%). Max 5000 (50%).
     *                     Pass 0 to use the collection default (10%).
     * @return tokenId The ID of the newly minted token.
     */
    function mintNFT(string memory _tokenURI, uint96 _royaltyBps)
        public
        payable
        whenNotPaused
        returns (uint256)
    {
        require(msg.value >= mintPrice, "Insufficient ETH sent for minting");
        require(_nextTokenId < maxSupply, "Maximum supply reached");
        require(_royaltyBps <= 5000, "Royalty cannot exceed 50%");

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        _creators[tokenId] = msg.sender;

        // Set per-token royalty (overrides collection default)
        if (_royaltyBps > 0) {
            _setTokenRoyalty(tokenId, msg.sender, _royaltyBps);
        }

        emit NFTMinted(tokenId, msg.sender, _tokenURI);
        return tokenId;
    }

    // --- Burning ---

    /**
     * @notice Permanently destroy an NFT. Only the current owner can burn.
     * @param tokenId The ID of the token to burn.
     */
    function burn(uint256 tokenId) public whenNotPaused {
        require(ownerOf(tokenId) == msg.sender, "Only the owner can burn this NFT");

        _burn(tokenId);
        _resetTokenRoyalty(tokenId);
        _burnedCount++;

        emit NFTBurned(tokenId, msg.sender);
    }

    // --- View Functions ---

    function getCreator(uint256 tokenId) public view returns (address) {
        return _creators[tokenId];
    }

    function getTotalMinted() public view returns (uint256) {
        return _nextTokenId;
    }

    function getBurnedCount() public view returns (uint256) {
        return _burnedCount;
    }

    /**
     * @notice Current circulating supply (minted minus burned).
     */
    function totalSupply() public view returns (uint256) {
        return _nextTokenId - _burnedCount;
    }

    // --- Owner Functions ---

    /**
     * @notice Pause the contract — disables minting and burning.
     *         Only callable by the contract owner in an emergency.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract — re-enables minting and burning.
     *         Only callable by the contract owner.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    function updateMintPrice(uint256 newPrice) public onlyOwner {
        mintPrice = newPrice;
    }

    /**
     * @notice Update the maximum supply cap. Must be >= current minted count.
     * @param newMaxSupply The new maximum supply value.
     */
    function updateMaxSupply(uint256 newMaxSupply) public onlyOwner {
        require(newMaxSupply >= _nextTokenId, "New max supply below minted count");
        maxSupply = newMaxSupply;
    }

    // --- Interface Support ---

    /**
     * @dev Required override for ERC721URIStorage + ERC2981.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
