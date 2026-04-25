/**
 * @file NFTMarketplace.test.js
 * @description Comprehensive Hardhat test suite for NFTMarketplace.sol
 *
 * Coverage:
 *   - Deployment & initial state
 *   - Fixed-price listings (create, buy, cancel, royalty splits)
 *   - English auctions (create, bid, outbid refund, settle, reserve not met)
 *   - Make Offer system (make, accept, cancel, expired offers)
 *   - Edit Listing / Update Price
 *   - Access control & edge cases
 *   - Pausable behavior
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
  loadFixture,
  time,
} = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('NFTMarketplace', function () {
  /**
   * Deploy fixture — deploys both NFTMinter and NFTMarketplace,
   * mints 3 test NFTs, and approves the marketplace.
   */
  async function deployFixture() {
    const [owner, seller, buyer, buyer2, creator] = await ethers.getSigners();

    // Deploy NFTMinter
    const NFTMinter = await ethers.getContractFactory('NFTMinter');
    const nft = await NFTMinter.deploy();
    await nft.waitForDeployment();

    // Deploy NFTMarketplace
    const NFTMarketplace = await ethers.getContractFactory('NFTMarketplace');
    const marketplace = await NFTMarketplace.deploy();
    await marketplace.waitForDeployment();

    const mintPrice = await nft.mintPrice();
    const nftAddress = await nft.getAddress();
    const marketplaceAddress = await marketplace.getAddress();

    // Mint 3 NFTs to seller with 10% royalty
    await nft.connect(seller).mintNFT('ipfs://token0', 1000, { value: mintPrice });
    await nft.connect(seller).mintNFT('ipfs://token1', 1000, { value: mintPrice });
    await nft.connect(seller).mintNFT('ipfs://token2', 500, { value: mintPrice });

    // Mint 1 NFT to creator for offer tests
    await nft.connect(creator).mintNFT('ipfs://token3', 2000, { value: mintPrice });

    // Approve marketplace for all seller's NFTs
    await nft.connect(seller).setApprovalForAll(marketplaceAddress, true);
    // Approve marketplace for creator's NFTs
    await nft.connect(creator).setApprovalForAll(marketplaceAddress, true);

    return {
      nft,
      marketplace,
      owner,
      seller,
      buyer,
      buyer2,
      creator,
      mintPrice,
      nftAddress,
      marketplaceAddress,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Deployment', function () {
    it('should set deployer as owner', async function () {
      const { marketplace, owner } = await loadFixture(deployFixture);
      expect(await marketplace.owner()).to.equal(owner.address);
    });

    it('should start with 0 listings and 0 offers', async function () {
      const { marketplace } = await loadFixture(deployFixture);
      expect(await marketplace.getTotalListings()).to.equal(0);
      expect(await marketplace.getTotalOffers()).to.equal(0);
    });

    it('should start unpaused', async function () {
      const { marketplace } = await loadFixture(deployFixture);
      expect(await marketplace.paused()).to.equal(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FIXED-PRICE LISTINGS
  // ═══════════════════════════════════════════════════════════════

  describe('Fixed-Price Listings', function () {
    it('should create a listing and escrow the NFT', async function () {
      const { nft, marketplace, seller, nftAddress, marketplaceAddress } =
        await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);

      // NFT should be in the marketplace contract
      expect(await nft.ownerOf(0)).to.equal(marketplaceAddress);

      // Listing data should be correct
      const listing = await marketplace.getListing(0);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.tokenId).to.equal(0);
      expect(listing.price).to.equal(price);
      expect(listing.isAuction).to.equal(false);
      expect(listing.active).to.equal(true);
    });

    it('should emit Listed event', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);
      const price = ethers.parseEther('1');

      await expect(marketplace.connect(seller).createListing(nftAddress, 0, price))
        .to.emit(marketplace, 'Listed')
        .withArgs(0, seller.address, nftAddress, 0, price, false, 0);
    });

    it('should allow buyer to purchase at listing price', async function () {
      const { nft, marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);
      await marketplace.connect(buyer).buyNow(0, { value: price });

      expect(await nft.ownerOf(0)).to.equal(buyer.address);

      const listing = await marketplace.getListing(0);
      expect(listing.active).to.equal(false);
    });

    it('should emit Sale event on purchase', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);

      await expect(marketplace.connect(buyer).buyNow(0, { value: price }))
        .to.emit(marketplace, 'Sale')
        .withArgs(0, buyer.address, 0, price);
    });

    it('should enforce ERC-2981 royalty split on sale', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);

      const sellerBalBefore = await ethers.provider.getBalance(seller.address);

      await marketplace.connect(buyer).buyNow(0, { value: price });

      const sellerBalAfter = await ethers.provider.getBalance(seller.address);
      const sellerReceived = sellerBalAfter - sellerBalBefore;

      // Token 0 has 10% royalty, but seller IS the creator, so no split
      // The seller should receive the full amount
      expect(sellerReceived).to.equal(price);
    });

    it('should refund overpayment', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);

      const overpayment = ethers.parseEther('2');
      const buyerBalBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await marketplace.connect(buyer).buyNow(0, { value: overpayment });
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const buyerBalAfter = await ethers.provider.getBalance(buyer.address);

      // Buyer should only spend price + gas (the extra 1 ETH is refunded)
      const spent = buyerBalBefore - buyerBalAfter - gasCost;
      expect(spent).to.be.closeTo(price, ethers.parseEther('0.001'));
    });

    it('should revert when seller tries to buy own listing', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);

      await expect(
        marketplace.connect(seller).buyNow(0, { value: price })
      ).to.be.revertedWithCustomError(marketplace, 'CannotBuyOwnListing');
    });

    it('should revert with insufficient payment', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);

      await expect(
        marketplace.connect(buyer).buyNow(0, { value: ethers.parseEther('0.5') })
      ).to.be.revertedWithCustomError(marketplace, 'InsufficientPayment');
    });

    it('should revert when buying inactive listing', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const price = ethers.parseEther('1');
      await marketplace.connect(seller).createListing(nftAddress, 0, price);
      await marketplace.connect(seller).cancelListing(0);

      await expect(
        marketplace.connect(buyer).buyNow(0, { value: price })
      ).to.be.revertedWithCustomError(marketplace, 'ListingNotActive');
    });

    it('should revert listing with zero price', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await expect(
        marketplace.connect(seller).createListing(nftAddress, 0, 0)
      ).to.be.revertedWithCustomError(marketplace, 'PriceCannotBeZero');
    });

    it('should revert listing from non-token-owner', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      await expect(
        marketplace.connect(buyer).createListing(nftAddress, 0, ethers.parseEther('1'))
      ).to.be.revertedWithCustomError(marketplace, 'NotTokenOwner');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CANCEL LISTING
  // ═══════════════════════════════════════════════════════════════

  describe('Cancel Listing', function () {
    it('should allow seller to cancel and return NFT', async function () {
      const { nft, marketplace, seller, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));
      await marketplace.connect(seller).cancelListing(0);

      expect(await nft.ownerOf(0)).to.equal(seller.address);

      const listing = await marketplace.getListing(0);
      expect(listing.active).to.equal(false);
    });

    it('should emit ListingCancelled event', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));

      await expect(marketplace.connect(seller).cancelListing(0))
        .to.emit(marketplace, 'ListingCancelled')
        .withArgs(0);
    });

    it('should revert cancel from non-seller', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));

      await expect(
        marketplace.connect(buyer).cancelListing(0)
      ).to.be.revertedWithCustomError(marketplace, 'NotSeller');
    });

    it('should work even when paused (user safety)', async function () {
      const { marketplace, owner, seller, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));
      await marketplace.connect(owner).pause();

      // cancelListing should still work when paused
      await expect(marketplace.connect(seller).cancelListing(0)).to.not.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // UPDATE LISTING PRICE
  // ═══════════════════════════════════════════════════════════════

  describe('Update Listing Price', function () {
    it('should allow seller to update price', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));

      const newPrice = ethers.parseEther('2');
      await marketplace.connect(seller).updateListingPrice(0, newPrice);

      const listing = await marketplace.getListing(0);
      expect(listing.price).to.equal(newPrice);
    });

    it('should emit ListingPriceUpdated event', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      const oldPrice = ethers.parseEther('1');
      const newPrice = ethers.parseEther('2');
      await marketplace.connect(seller).createListing(nftAddress, 0, oldPrice);

      await expect(marketplace.connect(seller).updateListingPrice(0, newPrice))
        .to.emit(marketplace, 'ListingPriceUpdated')
        .withArgs(0, oldPrice, newPrice);
    });

    it('should allow purchase at new price', async function () {
      const { nft, marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));

      const newPrice = ethers.parseEther('0.5');
      await marketplace.connect(seller).updateListingPrice(0, newPrice);

      await marketplace.connect(buyer).buyNow(0, { value: newPrice });
      expect(await nft.ownerOf(0)).to.equal(buyer.address);
    });

    it('should revert from non-seller', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));

      await expect(
        marketplace.connect(buyer).updateListingPrice(0, ethers.parseEther('2'))
      ).to.be.revertedWithCustomError(marketplace, 'NotSeller');
    });

    it('should revert for auction listings', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      const oneDay = 86400;
      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, oneDay);

      await expect(
        marketplace.connect(seller).updateListingPrice(0, ethers.parseEther('2'))
      ).to.be.revertedWithCustomError(marketplace, 'InvalidListingType');
    });

    it('should revert with zero price', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));

      await expect(
        marketplace.connect(seller).updateListingPrice(0, 0)
      ).to.be.revertedWithCustomError(marketplace, 'PriceCannotBeZero');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ENGLISH AUCTIONS
  // ═══════════════════════════════════════════════════════════════

  describe('English Auctions', function () {
    const ONE_DAY = 86400;

    it('should create an auction with correct parameters', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      const startPrice = ethers.parseEther('0.1');
      const reservePrice = ethers.parseEther('1');

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, startPrice, reservePrice, ONE_DAY);

      const listing = await marketplace.getListing(0);
      expect(listing.isAuction).to.equal(true);
      expect(listing.startPrice).to.equal(startPrice);
      expect(listing.reservePrice).to.equal(reservePrice);
      expect(listing.active).to.equal(true);
    });

    it('should accept valid first bid', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('0.1') });

      const listing = await marketplace.getListing(0);
      expect(listing.highestBidder).to.equal(buyer.address);
      expect(listing.highestBid).to.equal(ethers.parseEther('0.1'));
    });

    it('should emit BidPlaced event', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      const bidAmount = ethers.parseEther('0.5');
      await expect(marketplace.connect(buyer).placeBid(0, { value: bidAmount }))
        .to.emit(marketplace, 'BidPlaced')
        .withArgs(0, buyer.address, bidAmount);
    });

    it('should refund previous bidder when outbid', async function () {
      const { marketplace, seller, buyer, buyer2, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      // First bid
      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('0.5') });

      const buyerBalBefore = await ethers.provider.getBalance(buyer.address);

      // Second bid outbids first
      await expect(
        marketplace.connect(buyer2).placeBid(0, { value: ethers.parseEther('1') })
      )
        .to.emit(marketplace, 'BidRefunded')
        .withArgs(0, buyer.address, ethers.parseEther('0.5'));

      const buyerBalAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerBalAfter - buyerBalBefore).to.equal(ethers.parseEther('0.5'));
    });

    it('should revert bid below start price', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.5'), 0, ONE_DAY);

      await expect(
        marketplace.connect(buyer).placeBid(0, { value: ethers.parseEther('0.1') })
      ).to.be.revertedWithCustomError(marketplace, 'BidTooLow');
    });

    it('should revert bid not higher than current highest', async function () {
      const { marketplace, seller, buyer, buyer2, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('1') });

      await expect(
        marketplace.connect(buyer2).placeBid(0, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(marketplace, 'BidTooLow');
    });

    it('should settle auction and transfer NFT to winner', async function () {
      const { nft, marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('1') });

      // Advance time past auction end
      await time.increase(ONE_DAY + 1);

      await marketplace.settleAuction(0);

      expect(await nft.ownerOf(0)).to.equal(buyer.address);

      const listing = await marketplace.getListing(0);
      expect(listing.active).to.equal(false);
    });

    it('should return NFT to seller when no bids', async function () {
      const { nft, marketplace, seller, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await time.increase(ONE_DAY + 1);

      await marketplace.settleAuction(0);

      expect(await nft.ownerOf(0)).to.equal(seller.address);
    });

    it('should return NFT + refund when reserve not met', async function () {
      const { nft, marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(
          nftAddress,
          0,
          ethers.parseEther('0.1'),
          ethers.parseEther('5'), // High reserve
          ONE_DAY
        );

      // Bid below reserve
      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('1') });

      const buyerBalBefore = await ethers.provider.getBalance(buyer.address);

      await time.increase(ONE_DAY + 1);
      await marketplace.settleAuction(0);

      // NFT returns to seller
      expect(await nft.ownerOf(0)).to.equal(seller.address);

      // Buyer gets refunded
      const buyerBalAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerBalAfter - buyerBalBefore).to.equal(ethers.parseEther('1'));
    });

    it('should revert settle before auction ends', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await expect(marketplace.settleAuction(0)).to.be.revertedWithCustomError(
        marketplace,
        'AuctionNotEnded'
      );
    });

    it('should revert bid after auction ends', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await time.increase(ONE_DAY + 1);

      await expect(
        marketplace.connect(buyer).placeBid(0, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(marketplace, 'AuctionEnded');
    });

    it('should revert cancel auction with bids', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('0.5') });

      await expect(
        marketplace.connect(seller).cancelListing(0)
      ).to.be.revertedWithCustomError(marketplace, 'AuctionHasBids');
    });

    it('should allow cancel auction with no bids', async function () {
      const { nft, marketplace, seller, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await marketplace.connect(seller).cancelListing(0);
      expect(await nft.ownerOf(0)).to.equal(seller.address);
    });

    it('should revert invalid duration (too short)', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await expect(
        marketplace
          .connect(seller)
          .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, 60) // 1 min, too short
      ).to.be.revertedWithCustomError(marketplace, 'InvalidDuration');
    });

    it('should revert invalid duration (too long)', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      const thirtyOneDays = 31 * 86400;
      await expect(
        marketplace
          .connect(seller)
          .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, thirtyOneDays)
      ).to.be.revertedWithCustomError(marketplace, 'InvalidDuration');
    });

    it('should store bid history', async function () {
      const { marketplace, seller, buyer, buyer2, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('0.5') });

      await marketplace
        .connect(buyer2)
        .placeBid(0, { value: ethers.parseEther('1') });

      const bids = await marketplace.getListingBids(0);
      expect(bids.length).to.equal(2);
      expect(bids[0].bidder).to.equal(buyer.address);
      expect(bids[1].bidder).to.equal(buyer2.address);
    });

    it('should allow settleAuction even when paused (user safety)', async function () {
      const { marketplace, owner, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace
        .connect(seller)
        .createAuction(nftAddress, 0, ethers.parseEther('0.1'), 0, ONE_DAY);

      await marketplace
        .connect(buyer)
        .placeBid(0, { value: ethers.parseEther('1') });

      await time.increase(ONE_DAY + 1);
      await marketplace.connect(owner).pause();

      // settleAuction should work even when paused
      await expect(marketplace.settleAuction(0)).to.not.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MAKE OFFER SYSTEM
  // ═══════════════════════════════════════════════════════════════

  describe('Make Offer', function () {
    it('should create an offer with escrowed ETH', async function () {
      const { marketplace, buyer, nftAddress, marketplaceAddress } =
        await loadFixture(deployFixture);

      const offerAmount = ethers.parseEther('0.5');
      const expiresAt = (await time.latest()) + 86400; // 1 day from now

      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: offerAmount });

      const offer = await marketplace.getOffer(0);
      expect(offer.buyer).to.equal(buyer.address);
      expect(offer.amount).to.equal(offerAmount);
      expect(offer.tokenId).to.equal(0);
      expect(offer.active).to.equal(true);

      // ETH is escrowed in the contract
      const contractBal = await ethers.provider.getBalance(marketplaceAddress);
      expect(contractBal).to.equal(offerAmount);
    });

    it('should emit OfferMade event', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      const offerAmount = ethers.parseEther('0.5');
      const expiresAt = (await time.latest()) + 86400;

      await expect(
        marketplace
          .connect(buyer)
          .makeOffer(nftAddress, 0, expiresAt, { value: offerAmount })
      )
        .to.emit(marketplace, 'OfferMade')
        .withArgs(0, buyer.address, nftAddress, 0, offerAmount, expiresAt);
    });

    it('should allow token owner to accept offer', async function () {
      const { nft, marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const offerAmount = ethers.parseEther('0.5');
      const expiresAt = (await time.latest()) + 86400;

      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: offerAmount });

      const sellerBalBefore = await ethers.provider.getBalance(seller.address);

      const tx = await marketplace.connect(seller).acceptOffer(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // NFT goes to buyer
      expect(await nft.ownerOf(0)).to.equal(buyer.address);

      // Seller receives ETH (seller is creator, so full amount)
      const sellerBalAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerBalAfter - sellerBalBefore + gasCost).to.equal(offerAmount);
    });

    it('should emit OfferAccepted event', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;
      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') });

      await expect(marketplace.connect(seller).acceptOffer(0))
        .to.emit(marketplace, 'OfferAccepted')
        .withArgs(0, seller.address, buyer.address, 0, ethers.parseEther('1'));
    });

    it('should allow offer maker to cancel and get refund', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      const offerAmount = ethers.parseEther('0.5');
      const expiresAt = (await time.latest()) + 86400;

      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: offerAmount });

      const buyerBalBefore = await ethers.provider.getBalance(buyer.address);

      const tx = await marketplace.connect(buyer).cancelOffer(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      const buyerBalAfter = await ethers.provider.getBalance(buyer.address);
      expect(buyerBalAfter - buyerBalBefore + gasCost).to.equal(offerAmount);

      const offer = await marketplace.getOffer(0);
      expect(offer.active).to.equal(false);
    });

    it('should emit OfferCancelled event', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;
      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') });

      await expect(marketplace.connect(buyer).cancelOffer(0))
        .to.emit(marketplace, 'OfferCancelled')
        .withArgs(0);
    });

    it('should revert accept on expired offer', async function () {
      const { marketplace, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 3600; // 1 hour
      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') });

      // Advance past expiry
      await time.increase(7200);

      await expect(
        marketplace.connect(seller).acceptOffer(0)
      ).to.be.revertedWithCustomError(marketplace, 'OfferExpired');
    });

    it('should revert accept from non-owner', async function () {
      const { marketplace, buyer, buyer2, nftAddress } =
        await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;
      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') });

      await expect(
        marketplace.connect(buyer2).acceptOffer(0)
      ).to.be.revertedWithCustomError(marketplace, 'NotNFTOwner');
    });

    it('should revert cancel from non-offer-maker', async function () {
      const { marketplace, buyer, buyer2, nftAddress } =
        await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;
      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') });

      await expect(
        marketplace.connect(buyer2).cancelOffer(0)
      ).to.be.revertedWithCustomError(marketplace, 'NotOfferMaker');
    });

    it('should revert offer with zero ETH', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;
      await expect(
        marketplace.connect(buyer).makeOffer(nftAddress, 0, expiresAt, { value: 0 })
      ).to.be.revertedWithCustomError(marketplace, 'OfferTooLow');
    });

    it('should revert offer with past expiration', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      const pastTime = (await time.latest()) - 100;
      await expect(
        marketplace
          .connect(buyer)
          .makeOffer(nftAddress, 0, pastTime, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(marketplace, 'InvalidExpiration');
    });

    it('should return offers for a specific token', async function () {
      const { marketplace, buyer, buyer2, nftAddress } =
        await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;

      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('0.5') });

      await marketplace
        .connect(buyer2)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') });

      const offers = await marketplace.getOffersForToken(nftAddress, 0);
      expect(offers.length).to.equal(2);
    });

    it('should return offers by buyer', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;

      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('0.5') });

      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 1, expiresAt, { value: ethers.parseEther('1') });

      const offers = await marketplace.getOffersByBuyer(buyer.address);
      expect(offers.length).to.equal(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  describe('View Functions', function () {
    it('should return all listing IDs', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));
      await marketplace.connect(seller).createListing(nftAddress, 1, ethers.parseEther('2'));

      const ids = await marketplace.getAllListingIds();
      expect(ids.length).to.equal(2);
    });

    it('should return only active listings', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));
      await marketplace.connect(seller).createListing(nftAddress, 1, ethers.parseEther('2'));
      await marketplace.connect(seller).cancelListing(0);

      const active = await marketplace.getActiveListings();
      expect(active.length).to.equal(1);
      expect(active[0].tokenId).to.equal(1);
    });

    it('should return correct total listings count', async function () {
      const { marketplace, seller, nftAddress } = await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));
      await marketplace.connect(seller).createListing(nftAddress, 1, ethers.parseEther('2'));

      expect(await marketplace.getTotalListings()).to.equal(2);
    });

    it('should return correct total offers count', async function () {
      const { marketplace, buyer, nftAddress } = await loadFixture(deployFixture);

      const expiresAt = (await time.latest()) + 86400;
      await marketplace
        .connect(buyer)
        .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') });

      expect(await marketplace.getTotalOffers()).to.equal(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PAUSABLE
  // ═══════════════════════════════════════════════════════════════

  describe('Pausable', function () {
    it('should allow owner to pause and unpause', async function () {
      const { marketplace, owner } = await loadFixture(deployFixture);

      await marketplace.connect(owner).pause();
      expect(await marketplace.paused()).to.equal(true);

      await marketplace.connect(owner).unpause();
      expect(await marketplace.paused()).to.equal(false);
    });

    it('should block new listings when paused', async function () {
      const { marketplace, owner, seller, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(owner).pause();

      await expect(
        marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'))
      ).to.be.revertedWithCustomError(marketplace, 'EnforcedPause');
    });

    it('should block buyNow when paused', async function () {
      const { marketplace, owner, seller, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(seller).createListing(nftAddress, 0, ethers.parseEther('1'));
      await marketplace.connect(owner).pause();

      await expect(
        marketplace.connect(buyer).buyNow(0, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(marketplace, 'EnforcedPause');
    });

    it('should block new offers when paused', async function () {
      const { marketplace, owner, buyer, nftAddress } =
        await loadFixture(deployFixture);

      await marketplace.connect(owner).pause();

      const expiresAt = (await time.latest()) + 86400;
      await expect(
        marketplace
          .connect(buyer)
          .makeOffer(nftAddress, 0, expiresAt, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(marketplace, 'EnforcedPause');
    });

    it('should revert pause from non-owner', async function () {
      const { marketplace, buyer } = await loadFixture(deployFixture);

      await expect(
        marketplace.connect(buyer).pause()
      ).to.be.revertedWithCustomError(marketplace, 'OwnableUnauthorizedAccount');
    });
  });
});
