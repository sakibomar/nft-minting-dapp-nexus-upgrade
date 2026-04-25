/**
 * @file constants.js
 * @description Application constants — contract addresses, ABIs, network config.
 *
 * FIXES APPLIED:
 *   1. Added all 20 custom error definitions to MARKETPLACE_ABI so ethers.js
 *      can decode reverts into human-readable names instead of "unknown custom error".
 *   2. Added pause() and unpause() functions to MARKETPLACE_ABI — the admin
 *      dashboard calls these but they were missing from the ABI.
 */

// Contract Addresses (Sepolia)
export const CONTRACT_ADDRESS = '0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738';
export const MARKETPLACE_ADDRESS = '0x45F9EC0878f1236E4705C23099CaF6315C61D2dA';

// Network
export const SUPPORTED_CHAIN_ID = '0xaa36a7';
export const SUPPORTED_CHAIN_NAME = 'Sepolia';
export const ETHERSCAN_BASE = 'https://sepolia.etherscan.io';

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

// API
export const API_BASE_URL = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL);
export const SOCKET_URL = trimTrailingSlash(import.meta.env.VITE_SOCKET_URL || API_BASE_URL);

// IPFS
export const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

// NFTMinter ABI
export const CONTRACT_ABI = [
  {
    name: 'mintNFT',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'tokenURI', type: 'string' },
      { name: 'royaltyBps', type: 'uint96' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'burn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getCreator',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'getTotalMinted',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getBurnedCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'maxSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'mintPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'setApprovalForAll',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'isApprovedForAll',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'royaltyInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'salePrice', type: 'uint256' },
    ],
    outputs: [
      { name: 'receiver', type: 'address' },
      { name: 'royaltyAmount', type: 'uint256' },
    ],
  },
  {
    name: 'supportsInterface',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'pause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'unpause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'updateMintPrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newPrice', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'updateMaxSupply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newMaxSupply', type: 'uint256' }],
    outputs: [],
  },
  {
    anonymous: false,
    name: 'NFTMinted',
    type: 'event',
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'minter', type: 'address' },
      { indexed: false, name: 'tokenURI', type: 'string' },
    ],
  },
  {
    anonymous: false,
    name: 'NFTBurned',
    type: 'event',
    inputs: [
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: true, name: 'burner', type: 'address' },
    ],
  },
  {
    anonymous: false,
    name: 'Transfer',
    type: 'event',
    inputs: [
      { indexed: true, name: 'from', type: 'address' },
      { indexed: true, name: 'to', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
    ],
  },
];

// NFTMarketplace ABI (with offers + edit listing + custom errors + pause/unpause)
export const MARKETPLACE_ABI = [
  // ─── Custom Errors (FIX: added so ethers.js can decode reverts) ──────
  { name: 'NotTokenOwner',      type: 'error', inputs: [] },
  { name: 'PriceCannotBeZero',  type: 'error', inputs: [] },
  { name: 'ListingNotActive',   type: 'error', inputs: [] },
  { name: 'CannotBuyOwnListing',type: 'error', inputs: [] },
  { name: 'InsufficientPayment',type: 'error', inputs: [] },
  { name: 'NotAuction',         type: 'error', inputs: [] },
  { name: 'AuctionEnded',       type: 'error', inputs: [] },
  { name: 'AuctionNotEnded',    type: 'error', inputs: [] },
  { name: 'BidTooLow',          type: 'error', inputs: [] },
  { name: 'NotSeller',          type: 'error', inputs: [] },
  { name: 'AuctionHasBids',     type: 'error', inputs: [] },
  { name: 'InvalidDuration',    type: 'error', inputs: [] },
  { name: 'ReserveNotMet',      type: 'error', inputs: [] },
  { name: 'InvalidListingType', type: 'error', inputs: [] },
  { name: 'OfferTooLow',        type: 'error', inputs: [] },
  { name: 'OfferNotActive',     type: 'error', inputs: [] },
  { name: 'NotOfferMaker',      type: 'error', inputs: [] },
  { name: 'NotNFTOwner',        type: 'error', inputs: [] },
  { name: 'OfferExpired',       type: 'error', inputs: [] },
  { name: 'InvalidExpiration',  type: 'error', inputs: [] },

  // ─── Listings ────────────────────────────────────────────────────────
  {
    name: 'createListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'createAuction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'startPrice', type: 'uint256' },
      { name: 'reservePrice', type: 'uint256' },
      { name: 'duration', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'buyNow',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'placeBid',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'settleAuction',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'cancelListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'updateListingPrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'listingId', type: 'uint256' },
      { name: 'newPrice', type: 'uint256' },
    ],
    outputs: [],
  },

  // ─── Offers ──────────────────────────────────────────────────────────
  {
    name: 'makeOffer',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'acceptOffer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'cancelOffer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'declineOffer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [],
  },

  // ─── Events ──────────────────────────────────────────────────────────
  {
    name: 'OfferDeclined',
    type: 'event',
    inputs: [
      { name: 'offerId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },

  // ─── Admin (FIX: added pause/unpause — were missing) ────────────────
  {
    name: 'pause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'unpause',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // ─── Views ───────────────────────────────────────────────────────────
  {
    name: 'getListing',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'listingId', type: 'uint256' },
          { name: 'seller', type: 'address' },
          { name: 'nftContract', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'isAuction', type: 'bool' },
          { name: 'auctionEndTime', type: 'uint256' },
          { name: 'startPrice', type: 'uint256' },
          { name: 'reservePrice', type: 'uint256' },
          { name: 'highestBidder', type: 'address' },
          { name: 'highestBid', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getListingBids',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'bidder', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'getTotalListings',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getAllListingIds',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'getActiveListings',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'listingId', type: 'uint256' },
          { name: 'seller', type: 'address' },
          { name: 'nftContract', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'price', type: 'uint256' },
          { name: 'isAuction', type: 'bool' },
          { name: 'auctionEndTime', type: 'uint256' },
          { name: 'startPrice', type: 'uint256' },
          { name: 'reservePrice', type: 'uint256' },
          { name: 'highestBidder', type: 'address' },
          { name: 'highestBid', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getOffer',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'offerId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'offerId', type: 'uint256' },
          { name: 'buyer', type: 'address' },
          { name: 'nftContract', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getTotalOffers',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getOffersForToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'nftContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'offerId', type: 'uint256' },
          { name: 'buyer', type: 'address' },
          { name: 'nftContract', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getOffersByBuyer',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'buyer', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'offerId', type: 'uint256' },
          { name: 'buyer', type: 'address' },
          { name: 'nftContract', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiresAt', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },

  // ─── Events ──────────────────────────────────────────────────────────
  {
    anonymous: false,
    name: 'Listed',
    type: 'event',
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'seller', type: 'address' },
      { indexed: false, name: 'nftContract', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'price', type: 'uint256' },
      { indexed: false, name: 'isAuction', type: 'bool' },
      { indexed: false, name: 'auctionEndTime', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'Sale',
    type: 'event',
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'buyer', type: 'address' },
      { indexed: false, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'price', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'BidPlaced',
    type: 'event',
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'bidder', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'BidRefunded',
    type: 'event',
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'bidder', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'AuctionSettled',
    type: 'event',
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'winner', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'ListingCancelled',
    type: 'event',
    inputs: [{ indexed: true, name: 'listingId', type: 'uint256' }],
  },
  {
    anonymous: false,
    name: 'ListingPriceUpdated',
    type: 'event',
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: false, name: 'oldPrice', type: 'uint256' },
      { indexed: false, name: 'newPrice', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'OfferMade',
    type: 'event',
    inputs: [
      { indexed: true, name: 'offerId', type: 'uint256' },
      { indexed: true, name: 'buyer', type: 'address' },
      { indexed: false, name: 'nftContract', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'expiresAt', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'OfferAccepted',
    type: 'event',
    inputs: [
      { indexed: true, name: 'offerId', type: 'uint256' },
      { indexed: true, name: 'seller', type: 'address' },
      { indexed: true, name: 'buyer', type: 'address' },
      { indexed: false, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
  },
  {
    anonymous: false,
    name: 'OfferCancelled',
    type: 'event',
    inputs: [{ indexed: true, name: 'offerId', type: 'uint256' }],
  },
];
