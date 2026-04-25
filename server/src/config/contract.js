var ethers = require('ethers');

var CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738';
var MARKETPLACE_ADDRESS = process.env.MARKETPLACE_ADDRESS || '0x45F9EC0878f1236E4705C23099CaF6315C61D2dA';

var CONTRACT_ABI = [
  'function mintNFT(string memory tokenURI, uint96 royaltyBps) public payable returns (uint256)',
  'function burn(uint256 tokenId) public',
  'function getCreator(uint256 tokenId) public view returns (address)',
  'function getTotalMinted() public view returns (uint256)',
  'function getBurnedCount() public view returns (uint256)',
  'function totalSupply() public view returns (uint256)',
  'function maxSupply() public view returns (uint256)',
  'function mintPrice() public view returns (uint256)',
  'function tokenURI(uint256 tokenId) public view returns (string memory)',
  'function ownerOf(uint256 tokenId) public view returns (address)',
  'function balanceOf(address owner) public view returns (uint256)',
  'function transferFrom(address from, address to, uint256 tokenId) public',
  'function approve(address to, uint256 tokenId) public',
  'function setApprovalForAll(address operator, bool approved) public',
  'function isApprovedForAll(address owner, address operator) public view returns (bool)',
  'function royaltyInfo(uint256 tokenId, uint256 salePrice) public view returns (address receiver, uint256 royaltyAmount)',
  'function supportsInterface(bytes4 interfaceId) public view returns (bool)',
  'function paused() public view returns (bool)',
  'function owner() public view returns (address)',
  'function pause() external',
  'function unpause() external',
  'function withdraw() public',
  'function updateMintPrice(uint256 newPrice) public',
  'function updateMaxSupply(uint256 newMaxSupply) public',
  'event NFTMinted(uint256 indexed tokenId, address indexed minter, string tokenURI)',
  'event NFTBurned(uint256 indexed tokenId, address indexed burner)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
  'event ApprovalForAll(address indexed owner, address indexed operator, bool approved)',
];

var MARKETPLACE_ABI = [
  // Listings
  'function createListing(address nftContract, uint256 tokenId, uint256 price) external returns (uint256)',
  'function createAuction(address nftContract, uint256 tokenId, uint256 startPrice, uint256 reservePrice, uint256 duration) external returns (uint256)',
  'function buyNow(uint256 listingId) external payable',
  'function placeBid(uint256 listingId) external payable',
  'function settleAuction(uint256 listingId) external',
  'function cancelListing(uint256 listingId) external',
  'function updateListingPrice(uint256 listingId, uint256 newPrice) external',
  // Offers
  'function makeOffer(address nftContract, uint256 tokenId, uint256 expiresAt) external payable returns (uint256)',
  'function acceptOffer(uint256 offerId) external',
  'function cancelOffer(uint256 offerId) external',
  'function declineOffer(uint256 offerId) external',
  // View — Listings
  'function getListing(uint256 listingId) external view returns (tuple(uint256 listingId, address seller, address nftContract, uint256 tokenId, uint256 price, bool isAuction, uint256 auctionEndTime, uint256 startPrice, uint256 reservePrice, address highestBidder, uint256 highestBid, bool active))',
  'function getListingBids(uint256 listingId) external view returns (tuple(address bidder, uint256 amount, uint256 timestamp)[])',
  'function getTotalListings() external view returns (uint256)',
  'function getAllListingIds() external view returns (uint256[])',
  'function getActiveListings() external view returns (tuple(uint256 listingId, address seller, address nftContract, uint256 tokenId, uint256 price, bool isAuction, uint256 auctionEndTime, uint256 startPrice, uint256 reservePrice, address highestBidder, uint256 highestBid, bool active)[])',
  // View — Offers
  'function getOffer(uint256 offerId) external view returns (tuple(uint256 offerId, address buyer, address nftContract, uint256 tokenId, uint256 amount, uint256 expiresAt, bool active))',
  'function getTotalOffers() external view returns (uint256)',
  'function getAllOfferIds() external view returns (uint256[])',
  'function getOffersForToken(address nftContract, uint256 tokenId) external view returns (tuple(uint256 offerId, address buyer, address nftContract, uint256 tokenId, uint256 amount, uint256 expiresAt, bool active)[])',
  'function getOffersByBuyer(address buyer) external view returns (tuple(uint256 offerId, address buyer, address nftContract, uint256 tokenId, uint256 amount, uint256 expiresAt, bool active)[])',
  // Admin
  'function paused() external view returns (bool)',
  'function owner() external view returns (address)',
  'function pause() external',
  'function unpause() external',
  // Events
  'event Listed(uint256 indexed listingId, address indexed seller, address nftContract, uint256 indexed tokenId, uint256 price, bool isAuction, uint256 auctionEndTime)',
  'event Sale(uint256 indexed listingId, address indexed buyer, uint256 tokenId, uint256 price)',
  'event BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 amount)',
  'event BidRefunded(uint256 indexed listingId, address indexed bidder, uint256 amount)',
  'event AuctionSettled(uint256 indexed listingId, address indexed winner, uint256 amount)',
  'event ListingCancelled(uint256 indexed listingId)',
  'event ListingPriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice)',
  'event OfferMade(uint256 indexed offerId, address indexed buyer, address nftContract, uint256 indexed tokenId, uint256 amount, uint256 expiresAt)',
  'event OfferAccepted(uint256 indexed offerId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 amount)',
  'event OfferCancelled(uint256 indexed offerId)',
  'event OfferDeclined(uint256 indexed offerId, address indexed owner)',
];

/* ══════════════════════════════════════════════════════════════════════
   SINGLETON PROVIDER
   Creates ONE provider and reuses it for every request.
   The original code created a NEW provider on every getContract() call,
   which wasted an eth_chainId RPC call each time and hammered
   Alchemy's free-tier rate limit.
   ══════════════════════════════════════════════════════════════════════ */
var _provider = null;
var _unsupportedReadMethods = new Set();

function getErrorText(err) {
  var parts = [];
  var seen = [];

  function add(value) {
    if (typeof value === 'string' && value) {
      parts.push(value.toLowerCase());
    }
  }

  function visit(value, depth) {
    if (!value || depth > 3) return;

    if (typeof value === 'string') {
      add(value);
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.indexOf(value) !== -1) return;
    seen.push(value);

    add(value.code != null ? String(value.code) : '');
    add(value.message);
    add(value.reason);
    add(value.shortMessage);

    visit(value.error, depth + 1);
    visit(value.info, depth + 1);
    visit(value.payload, depth + 1);
    visit(value.data, depth + 1);
  }

  visit(err, 0);
  return parts.join(' | ');
}

function inferRpcNetwork(rpcUrl) {
  var normalized = String(rpcUrl || '').toLowerCase();

  if (normalized.indexOf('sepolia') !== -1) return 'sepolia';
  if (normalized.indexOf('mainnet') !== -1) return 'mainnet';

  // Local chains can restart or fork, so avoid pinning them statically.
  if (normalized.indexOf('localhost') !== -1 || normalized.indexOf('127.0.0.1') !== -1) {
    return null;
  }

  return null;
}

function getProvider() {
  if (!_provider) {
    var rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) throw new Error('RPC_URL not defined in .env');

    var rpcNetwork = process.env.RPC_NETWORK || inferRpcNetwork(rpcUrl);

    if (rpcNetwork) {
      _provider = new ethers.JsonRpcProvider(rpcUrl, rpcNetwork, { staticNetwork: true });
    } else {
      _provider = new ethers.JsonRpcProvider(rpcUrl);
    }
  }
  return _provider;
}

function isRateLimitError(err) {
  var msg = getErrorText(err);
  return (
    msg.indexOf('429') !== -1 ||
    msg.indexOf('too many') !== -1 ||
    msg.indexOf('compute units') !== -1 ||
    msg.indexOf('throughput') !== -1 ||
    msg.indexOf('rate limit') !== -1 ||
    msg.indexOf('rate_limit') !== -1
  );
}

function isMissingMethodError(err) {
  var msg = getErrorText(err);
  return !!(err && (
    err.code === 'CALL_EXCEPTION' ||
    err.code === 'BAD_DATA' ||
    msg.indexOf('missing revert data') !== -1 ||
    msg.indexOf('execution reverted') !== -1 ||
    msg.indexOf('function selector was not recognized') !== -1 ||
    msg.indexOf('could not decode result data') !== -1 ||
    msg.indexOf('no data present') !== -1 ||
    msg.indexOf('method not found') !== -1
  ));
}

function isDefinitelyUnsupportedMethodError(err) {
  var msg = getErrorText(err);
  return !!(err && (
    err.code === 'BAD_DATA' ||
    msg.indexOf('function selector was not recognized') !== -1 ||
    msg.indexOf('could not decode result data') !== -1 ||
    msg.indexOf('no data present') !== -1 ||
    msg.indexOf('method not found') !== -1
  ));
}

function getReadMethodKey(contract, methodName) {
  var target = contract && contract.target ? String(contract.target).toLowerCase() : 'unknown';
  return target + ':' + methodName;
}

function resolveFallbackValue(fallbackValue, err) {
  return typeof fallbackValue === 'function' ? fallbackValue(err) : fallbackValue;
}

async function callOptional(contract, methodName, args, fallbackValue) {
  var methodArgs = Array.isArray(args) ? args : [];
  var key = getReadMethodKey(contract, methodName);

  if (_unsupportedReadMethods.has(key)) {
    return resolveFallbackValue(fallbackValue);
  }

  try {
    return await contract[methodName].apply(contract, methodArgs);
  } catch (err) {
    if (isDefinitelyUnsupportedMethodError(err)) {
      _unsupportedReadMethods.add(key);
      return resolveFallbackValue(fallbackValue, err);
    }

    if (isMissingMethodError(err)) {
      return resolveFallbackValue(fallbackValue, err);
    }

    if (isRateLimitError(err)) {
      return resolveFallbackValue(fallbackValue, err);
    }

    throw err;
  }
}

function getContract() {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, getProvider());
}

function getMarketplaceContract() {
  return new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, getProvider());
}

module.exports = {
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  MARKETPLACE_ADDRESS,
  MARKETPLACE_ABI,
  callOptional,
  getProvider,
  getContract,
  getMarketplaceContract,
  getErrorText,
  isMissingMethodError,
  isRateLimitError,
};
