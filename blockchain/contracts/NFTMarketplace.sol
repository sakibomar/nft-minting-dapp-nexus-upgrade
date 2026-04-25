// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ============================================================
// NFTMarketplace Smart Contract — CN6035 Coursework (Upgraded)
// ============================================================
// Features:
//   * Fixed-price listings with instant buy
//   * English auctions with reserve price and timed bidding
//   * Make Offer on ANY NFT (listed or unlisted)
//   * Edit listing price without cancel/relist
//   * Automatic bid refunds when outbid
//   * ERC-2981 royalty enforcement on every sale
//   * Pausable — emergency stop for new listings/buys/bids
//   * Settle & cancel always available (user safety)
// ============================================================

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTMarketplace
 * @author CN6035 Coursework
 * @notice Full-featured NFT marketplace with fixed-price sales, English
 *         auctions, make-offer system, and ERC-2981 royalty enforcement.
 */
contract NFTMarketplace is ReentrancyGuard, Ownable, Pausable {

    // ─── Custom Errors ───────────────────────────────────────────

    error NotTokenOwner();
    error PriceCannotBeZero();
    error ListingNotActive();
    error CannotBuyOwnListing();
    error InsufficientPayment();
    error NotAuction();
    error AuctionEnded();
    error AuctionNotEnded();
    error BidTooLow();
    error NotSeller();
    error AuctionHasBids();
    error InvalidDuration();
    error ReserveNotMet();
    error InvalidListingType();
    error OfferTooLow();
    error OfferNotActive();
    error NotOfferMaker();
    error NotNFTOwner();
    error OfferExpired();
    error InvalidExpiration();

    // ─── Structs ─────────────────────────────────────────────────

    struct Listing {
        uint256 listingId;
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        bool isAuction;
        uint256 auctionEndTime;
        uint256 startPrice;
        uint256 reservePrice;
        address highestBidder;
        uint256 highestBid;
        bool active;
    }

    struct Bid {
        address bidder;
        uint256 amount;
        uint256 timestamp;
    }

    struct Offer {
        uint256 offerId;
        address buyer;
        address nftContract;
        uint256 tokenId;
        uint256 amount;
        uint256 expiresAt;
        bool active;
    }

    // ─── State Variables ─────────────────────────────────────────

    uint256 private _nextListingId;
    uint256 private _nextOfferId;

    mapping(uint256 => Listing) private _listings;
    mapping(uint256 => Bid[]) private _bids;
    mapping(uint256 => Offer) private _offers;

    uint256[] private _allListingIds;
    uint256[] private _allOfferIds;

    // ─── Events ──────────────────────────────────────────────────

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address nftContract,
        uint256 indexed tokenId,
        uint256 price,
        bool isAuction,
        uint256 auctionEndTime
    );

    event Sale(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 tokenId,
        uint256 price
    );

    event BidPlaced(
        uint256 indexed listingId,
        address indexed bidder,
        uint256 amount
    );

    event BidRefunded(
        uint256 indexed listingId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionSettled(
        uint256 indexed listingId,
        address indexed winner,
        uint256 amount
    );

    event ListingCancelled(uint256 indexed listingId);

    event ListingPriceUpdated(
        uint256 indexed listingId,
        uint256 oldPrice,
        uint256 newPrice
    );

    event OfferMade(
        uint256 indexed offerId,
        address indexed buyer,
        address nftContract,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 expiresAt
    );

    event OfferAccepted(
        uint256 indexed offerId,
        address indexed seller,
        address indexed buyer,
        uint256 tokenId,
        uint256 amount
    );

    event OfferCancelled(uint256 indexed offerId);
    event OfferDeclined(uint256 indexed offerId, address indexed owner);

    // ─── Constructor ─────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ─── Listing Functions ───────────────────────────────────────

    /**
     * @notice Create a fixed-price listing. NFT is escrowed in the contract.
     * @param nftContract Address of the ERC-721 contract.
     * @param tokenId     The token to list.
     * @param price       Sale price in wei.
     * @return listingId  The ID of the new listing.
     */
    function createListing(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (IERC721(nftContract).ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (price == 0) revert PriceCannotBeZero();

        uint256 listingId = _nextListingId++;

        _listings[listingId] = Listing({
            listingId: listingId,
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            isAuction: false,
            auctionEndTime: 0,
            startPrice: 0,
            reservePrice: 0,
            highestBidder: address(0),
            highestBid: 0,
            active: true
        });

        _allListingIds.push(listingId);

        // Escrow the NFT
        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        emit Listed(listingId, msg.sender, nftContract, tokenId, price, false, 0);
        return listingId;
    }

    /**
     * @notice Create an English auction listing.
     * @param nftContract  Address of the ERC-721 contract.
     * @param tokenId      The token to auction.
     * @param startPrice   Minimum first bid.
     * @param reservePrice Minimum price for the auction to settle (0 = no reserve).
     * @param duration     Auction length in seconds (1 hour – 30 days).
     * @return listingId   The ID of the new listing.
     */
    function createAuction(
        address nftContract,
        uint256 tokenId,
        uint256 startPrice,
        uint256 reservePrice,
        uint256 duration
    ) external whenNotPaused nonReentrant returns (uint256) {
        if (IERC721(nftContract).ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (startPrice == 0) revert PriceCannotBeZero();
        if (duration < 1 hours || duration > 30 days) revert InvalidDuration();

        uint256 listingId = _nextListingId++;
        uint256 endTime = block.timestamp + duration;

        _listings[listingId] = Listing({
            listingId: listingId,
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: startPrice,
            isAuction: true,
            auctionEndTime: endTime,
            startPrice: startPrice,
            reservePrice: reservePrice,
            highestBidder: address(0),
            highestBid: 0,
            active: true
        });

        _allListingIds.push(listingId);

        IERC721(nftContract).transferFrom(msg.sender, address(this), tokenId);

        emit Listed(listingId, msg.sender, nftContract, tokenId, startPrice, true, endTime);
        return listingId;
    }

    /**
     * @notice Buy a fixed-price listing instantly.
     * @param listingId The listing to purchase.
     */
    function buyNow(uint256 listingId) external payable whenNotPaused nonReentrant {
        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (listing.isAuction) revert InvalidListingType();
        if (msg.sender == listing.seller) revert CannotBuyOwnListing();
        if (msg.value < listing.price) revert InsufficientPayment();

        listing.active = false;

        _handlePayment(listing.nftContract, listing.tokenId, listing.seller, listing.price);

        IERC721(listing.nftContract).transferFrom(address(this), msg.sender, listing.tokenId);

        // Refund overpayment
        if (msg.value > listing.price) {
            (bool refundOk, ) = payable(msg.sender).call{value: msg.value - listing.price}("");
            require(refundOk, "Refund failed");
        }

        emit Sale(listingId, msg.sender, listing.tokenId, listing.price);
    }

    /**
     * @notice Place a bid on an active auction.
     * @param listingId The auction to bid on.
     */
    function placeBid(uint256 listingId) external payable whenNotPaused nonReentrant {
        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (!listing.isAuction) revert NotAuction();
        if (block.timestamp >= listing.auctionEndTime) revert AuctionEnded();
        if (msg.sender == listing.seller) revert CannotBuyOwnListing();

        // First bid must meet start price; subsequent bids must beat current highest
        if (listing.highestBid == 0) {
            if (msg.value < listing.startPrice) revert BidTooLow();
        } else {
            if (msg.value <= listing.highestBid) revert BidTooLow();
        }

        // Refund previous highest bidder
        if (listing.highestBidder != address(0)) {
            uint256 refundAmount = listing.highestBid;
            address refundTo = listing.highestBidder;

            emit BidRefunded(listingId, refundTo, refundAmount);

            (bool refundOk, ) = payable(refundTo).call{value: refundAmount}("");
            require(refundOk, "Bid refund failed");
        }

        listing.highestBidder = msg.sender;
        listing.highestBid = msg.value;

        _bids[listingId].push(Bid({
            bidder: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp
        }));

        emit BidPlaced(listingId, msg.sender, msg.value);
    }

    /**
     * @notice Settle a completed auction. Always callable (even when paused).
     * @param listingId The auction to settle.
     */
    function settleAuction(uint256 listingId) external nonReentrant {
        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (!listing.isAuction) revert NotAuction();
        if (block.timestamp < listing.auctionEndTime) revert AuctionNotEnded();

        listing.active = false;

        if (listing.highestBidder == address(0) ||
            (listing.reservePrice > 0 && listing.highestBid < listing.reservePrice)) {
            // No bids or reserve not met — return NFT to seller
            IERC721(listing.nftContract).transferFrom(
                address(this), listing.seller, listing.tokenId
            );

            // Refund highest bidder if reserve not met
            if (listing.highestBidder != address(0)) {
                (bool refundOk, ) = payable(listing.highestBidder).call{
                    value: listing.highestBid
                }("");
                require(refundOk, "Bid refund failed");
                emit BidRefunded(listingId, listing.highestBidder, listing.highestBid);
            }

            emit AuctionSettled(listingId, address(0), 0);
        } else {
            // Auction successful — transfer NFT to winner, pay seller + royalty
            _handlePayment(
                listing.nftContract,
                listing.tokenId,
                listing.seller,
                listing.highestBid
            );

            IERC721(listing.nftContract).transferFrom(
                address(this), listing.highestBidder, listing.tokenId
            );

            emit AuctionSettled(listingId, listing.highestBidder, listing.highestBid);
        }
    }

    /**
     * @notice Cancel a listing. Always callable (even when paused).
     *         Auctions with bids cannot be cancelled.
     * @param listingId The listing to cancel.
     */
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (msg.sender != listing.seller) revert NotSeller();
        if (listing.isAuction && listing.highestBidder != address(0)) revert AuctionHasBids();

        listing.active = false;

        // Return NFT to seller
        IERC721(listing.nftContract).transferFrom(
            address(this), listing.seller, listing.tokenId
        );

        emit ListingCancelled(listingId);
    }

    /**
     * @notice Update the price of a fixed-price listing without cancelling.
     * @param listingId The listing to update.
     * @param newPrice  The new price in wei. Must be > 0.
     */
    function updateListingPrice(uint256 listingId, uint256 newPrice)
        external
        whenNotPaused
    {
        Listing storage listing = _listings[listingId];
        if (!listing.active) revert ListingNotActive();
        if (msg.sender != listing.seller) revert NotSeller();
        if (listing.isAuction) revert InvalidListingType();
        if (newPrice == 0) revert PriceCannotBeZero();

        uint256 oldPrice = listing.price;
        listing.price = newPrice;

        emit ListingPriceUpdated(listingId, oldPrice, newPrice);
    }

    // ─── Offer Functions ─────────────────────────────────────────

    /**
     * @notice Make an offer on any NFT (listed or unlisted).
     *         ETH is escrowed in the contract until accepted, cancelled, or expired.
     * @param nftContract Address of the ERC-721 contract.
     * @param tokenId     The token to make an offer on.
     * @param expiresAt   Unix timestamp when the offer expires. Must be in the future.
     * @return offerId    The ID of the new offer.
     */
    function makeOffer(
        address nftContract,
        uint256 tokenId,
        uint256 expiresAt
    ) external payable whenNotPaused nonReentrant returns (uint256) {
        if (msg.value == 0) revert OfferTooLow();
        if (expiresAt <= block.timestamp) revert InvalidExpiration();

        // Verify the token exists (ownerOf reverts for non-existent tokens)
        IERC721(nftContract).ownerOf(tokenId);

        uint256 offerId = _nextOfferId++;

        _offers[offerId] = Offer({
            offerId: offerId,
            buyer: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            amount: msg.value,
            expiresAt: expiresAt,
            active: true
        });

        _allOfferIds.push(offerId);

        emit OfferMade(offerId, msg.sender, nftContract, tokenId, msg.value, expiresAt);
        return offerId;
    }

    /**
     * @notice Accept an offer on your NFT. The NFT owner must have approved
     *         this contract. The offer ETH goes to the seller (minus royalty),
     *         and the NFT goes to the buyer.
     * @param offerId The offer to accept.
     */
    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = _offers[offerId];
        if (!offer.active) revert OfferNotActive();
        if (block.timestamp > offer.expiresAt) revert OfferExpired();

        address tokenOwner = IERC721(offer.nftContract).ownerOf(offer.tokenId);
        if (msg.sender != tokenOwner) revert NotNFTOwner();

        offer.active = false;

        // Handle royalty payment split
        _handlePayment(offer.nftContract, offer.tokenId, msg.sender, offer.amount);

        // Transfer NFT from seller to buyer
        IERC721(offer.nftContract).transferFrom(msg.sender, offer.buyer, offer.tokenId);

        emit OfferAccepted(offerId, msg.sender, offer.buyer, offer.tokenId, offer.amount);
    }

    /**
     * @notice Cancel your own offer. ETH is refunded immediately.
     * @param offerId The offer to cancel.
     */
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = _offers[offerId];
        if (!offer.active) revert OfferNotActive();
        if (msg.sender != offer.buyer) revert NotOfferMaker();

        offer.active = false;

        (bool ok, ) = payable(msg.sender).call{value: offer.amount}("");
        require(ok, "Refund failed");

        emit OfferCancelled(offerId);
    }

    /**
     * @notice Decline an offer on your NFT. Only the current token owner can call.
     *         Immediately refunds the buyer's ETH.
     * @param offerId The offer to decline.
     */
    function declineOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = _offers[offerId];
        if (!offer.active) revert OfferNotActive();

        // Only the current NFT owner can decline
        address tokenOwner = IERC721(offer.nftContract).ownerOf(offer.tokenId);
        if (msg.sender != tokenOwner) revert NotNFTOwner();

        offer.active = false;

        // Refund the buyer
        (bool ok, ) = payable(offer.buyer).call{value: offer.amount}("");
        require(ok, "Refund failed");

        emit OfferDeclined(offerId, msg.sender);
    }

    // ─── View Functions ──────────────────────────────────────────

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    function getListingBids(uint256 listingId) external view returns (Bid[] memory) {
        return _bids[listingId];
    }

    function getTotalListings() external view returns (uint256) {
        return _nextListingId;
    }

    function getAllListingIds() external view returns (uint256[] memory) {
        return _allListingIds;
    }

    function getActiveListings() external view returns (Listing[] memory) {
        uint256 count;
        for (uint256 i; i < _allListingIds.length; i++) {
            if (_listings[_allListingIds[i]].active) count++;
        }

        Listing[] memory result = new Listing[](count);
        uint256 idx;
        for (uint256 i; i < _allListingIds.length; i++) {
            if (_listings[_allListingIds[i]].active) {
                result[idx++] = _listings[_allListingIds[i]];
            }
        }
        return result;
    }

    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return _offers[offerId];
    }

    function getTotalOffers() external view returns (uint256) {
        return _nextOfferId;
    }

    function getAllOfferIds() external view returns (uint256[] memory) {
        return _allOfferIds;
    }

    /**
     * @notice Get all active offers for a specific NFT token.
     * @param nftContract The NFT contract address.
     * @param tokenId     The token ID.
     * @return Active offers for that token.
     */
    function getOffersForToken(address nftContract, uint256 tokenId)
        external
        view
        returns (Offer[] memory)
    {
        uint256 count;
        for (uint256 i; i < _allOfferIds.length; i++) {
            Offer storage o = _offers[_allOfferIds[i]];
            if (o.active &&
                o.nftContract == nftContract &&
                o.tokenId == tokenId &&
                block.timestamp <= o.expiresAt) {
                count++;
            }
        }

        Offer[] memory result = new Offer[](count);
        uint256 idx;
        for (uint256 i; i < _allOfferIds.length; i++) {
            Offer storage o = _offers[_allOfferIds[i]];
            if (o.active &&
                o.nftContract == nftContract &&
                o.tokenId == tokenId &&
                block.timestamp <= o.expiresAt) {
                result[idx++] = o;
            }
        }
        return result;
    }

    /**
     * @notice Get all active offers made by a specific address.
     * @param buyer The buyer address.
     * @return Active offers by that address.
     */
    function getOffersByBuyer(address buyer) external view returns (Offer[] memory) {
        uint256 count;
        for (uint256 i; i < _allOfferIds.length; i++) {
            Offer storage o = _offers[_allOfferIds[i]];
            if (o.active && o.buyer == buyer && block.timestamp <= o.expiresAt) {
                count++;
            }
        }

        Offer[] memory result = new Offer[](count);
        uint256 idx;
        for (uint256 i; i < _allOfferIds.length; i++) {
            Offer storage o = _offers[_allOfferIds[i]];
            if (o.active && o.buyer == buyer && block.timestamp <= o.expiresAt) {
                result[idx++] = o;
            }
        }
        return result;
    }

    // ─── Owner Functions ─────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Internal Functions ──────────────────────────────────────

    /**
     * @dev Handle payment with ERC-2981 royalty split.
     *      Queries royalty info from the NFT contract. If the NFT
     *      supports ERC-2981, the royalty is paid to the creator
     *      and the remainder goes to the seller.
     */
    function _handlePayment(
        address nftContract,
        uint256 tokenId,
        address seller,
        uint256 salePrice
    ) internal {
        uint256 royaltyAmount;
        address royaltyReceiver;

        // Check if the NFT contract supports ERC-2981
        try IERC2981(nftContract).royaltyInfo(tokenId, salePrice) returns (
            address receiver,
            uint256 amount
        ) {
            royaltyReceiver = receiver;
            royaltyAmount = amount;
        } catch {
            // Contract doesn't support ERC-2981 — no royalty
        }

        // Safety: royalty cannot exceed sale price
        if (royaltyAmount > salePrice) {
            royaltyAmount = 0;
        }

        // Pay royalty to creator (if applicable and not the seller)
        if (royaltyAmount > 0 && royaltyReceiver != address(0) && royaltyReceiver != seller) {
            (bool royaltyOk, ) = payable(royaltyReceiver).call{value: royaltyAmount}("");
            require(royaltyOk, "Royalty payment failed");
        } else {
            // Seller IS the creator — no split needed
            royaltyAmount = 0;
        }

        // Pay seller the remainder
        uint256 sellerAmount = salePrice - royaltyAmount;
        if (sellerAmount > 0) {
            (bool sellerOk, ) = payable(seller).call{value: sellerAmount}("");
            require(sellerOk, "Seller payment failed");
        }
    }
}
