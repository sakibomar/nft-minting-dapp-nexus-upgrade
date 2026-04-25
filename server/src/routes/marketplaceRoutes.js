const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { callOptional, getContract, getMarketplaceContract, CONTRACT_ADDRESS, isMissingMethodError, isRateLimitError } = require('../config/contract');
const eventStore = require('../cache/eventStore');
const { resolveTokenMetadata } = require('../utils/ipfs');

/* ══════════════════════════════════════════════════════════════════════
   RESPONSE CACHE + INFLIGHT DEDUPLICATION

   FIX APPLIED:
     1. Cache TTL: 5s → 30s (prevents 429 floods from multiple tabs)
     2. Inflight dedup: concurrent requests to the same endpoint share
        a single Promise — no duplicate RPC calls
   ══════════════════════════════════════════════════════════════════════ */
var _cache = {};
var _lastGood = {};
var CACHE_TTL = 30000; // FIX: was 5000
var FORCE_REFRESH_GRACE_MS = 5000;

/** Inflight promise map — prevents duplicate concurrent fetches */
var _inflight = {};

function getCached(key) {
  var entry = _cache[key];
  if (entry && (Date.now() - entry.time) < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) {
  _cache[key] = { data: data, time: Date.now() };
  _lastGood[key] = data;
}

function clearCacheEntry(key) {
  delete _cache[key];
  delete _lastGood[key];
  delete _inflight[key];
}
function getLastGood(key) {
  return _lastGood[key] || null;
}

function clearMarketplaceCaches() {
  clearCacheEntry('listings');
  clearCacheEntry('active_listings');
}

/**
 * Fetch data with deduplication.
 * Cache → inflight piggyback → new fetch.
 */
function fetchWithDedup(key, fetchFn, force = false) {
  var entry = _cache[key];
  if (entry) {
    var age = Date.now() - entry.time;
    if (!force && age < CACHE_TTL) {
      return Promise.resolve(entry.data);
    }
    if (force && age < FORCE_REFRESH_GRACE_MS) {
      return Promise.resolve(entry.data);
    }
  }

  if (_inflight[key]) return _inflight[key];

  _inflight[key] = fetchFn().then(function (data) {
    setCache(key, data);
    delete _inflight[key];
    return data;
  }).catch(function (err) {
    delete _inflight[key];
    throw err;
  });

  return _inflight[key];
}

/**
 * Format a raw listing struct from the contract into a JSON-friendly object.
 * @param {object} listing - Raw listing tuple from the contract
 * @returns {object} Formatted listing
 */
function formatListing(listing) {
  return {
    listingId: Number(listing.listingId),
    seller: listing.seller,
    nftContract: listing.nftContract,
    tokenId: Number(listing.tokenId),
    price: ethers.formatEther(listing.price),
    priceWei: listing.price.toString(),
    isAuction: listing.isAuction,
    auctionEndTime: Number(listing.auctionEndTime),
    startPrice: ethers.formatEther(listing.startPrice),
    startPriceWei: listing.startPrice.toString(),
    reservePrice: ethers.formatEther(listing.reservePrice),
    reservePriceWei: listing.reservePrice.toString(),
    highestBidder: listing.highestBidder,
    highestBid: ethers.formatEther(listing.highestBid),
    highestBidWei: listing.highestBid.toString(),
    active: listing.active,
  };
}

/**
 * Format a raw bid struct from the contract into a JSON-friendly object.
 * @param {object} bid - Raw bid tuple from the contract
 * @returns {object} Formatted bid
 */
function formatBid(bid) {
  return {
    bidder: bid.bidder,
    amount: ethers.formatEther(bid.amount),
    amountWei: bid.amount.toString(),
    timestamp: Number(bid.timestamp),
  };
}

function toWeiString(value) {
  try {
    return ethers.parseEther(String(value || '0')).toString();
  } catch (_err) {
    return '0';
  }
}

function getListingsFromEventStore(options) {
  var activeOnly = !!(options && options.activeOnly);
  var events = eventStore.getAllEvents().slice().sort(function (a, b) {
    return (a.blockNumber || 0) - (b.blockNumber || 0);
  });
  var listings = new Map();

  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    var listingId = Number(evt.listingId);
    if (!Number.isFinite(listingId)) continue;

    if (evt.eventType === 'listed') {
      var price = String(evt.value || '0');
      listings.set(listingId, {
        listingId: listingId,
        seller: evt.from || ethers.ZeroAddress,
        nftContract: CONTRACT_ADDRESS,
        tokenId: Number(evt.tokenId),
        price: price,
        priceWei: toWeiString(price),
        isAuction: !!evt.isAuction,
        auctionEndTime: 0,
        startPrice: !!evt.isAuction ? price : '0',
        startPriceWei: !!evt.isAuction ? toWeiString(price) : '0',
        reservePrice: '0',
        reservePriceWei: '0',
        highestBidder: ethers.ZeroAddress,
        highestBid: '0',
        highestBidWei: '0',
        active: true,
      });
      continue;
    }

    if (evt.eventType === 'price_updated' && listings.has(listingId) && evt.value) {
      var current = listings.get(listingId);
      var nextPrice = String(evt.value);
      current.price = nextPrice;
      current.priceWei = toWeiString(nextPrice);
      if (current.isAuction) {
        current.startPrice = nextPrice;
        current.startPriceWei = current.priceWei;
      }
      listings.set(listingId, current);
      continue;
    }

    if (
      (evt.eventType === 'sale' || evt.eventType === 'auction_settled' || evt.eventType === 'listing_cancelled') &&
      listings.has(listingId)
    ) {
      var listing = listings.get(listingId);
      listing.active = false;
      listings.set(listingId, listing);
    }
  }

  var result = Array.from(listings.values()).sort(function (a, b) {
    return b.listingId - a.listingId;
  });

  return activeOnly ? result.filter(function (listing) { return listing.active; }) : result;
}

function getListingFromEventStore(listingId) {
  var listings = getListingsFromEventStore();
  for (var i = 0; i < listings.length; i++) {
    if (Number(listings[i].listingId) === Number(listingId)) {
      return listings[i];
    }
  }
  return null;
}

function getFallbackListingIds(totalListings) {
  return Array.from({ length: totalListings }, function (_, i) { return BigInt(i); });
}

/**
 * Enrich a formatted listing with resolved NFT metadata.
 * @param {object} listing - Formatted listing object
 * @param {import('ethers').Contract} nftContract - NFT contract instance
 * @returns {Promise<object>} Listing with metadata fields
 */
async function enrichListingWithMetadata(listing, nftContract) {
  try {
    const tokenURI = await nftContract.tokenURI(listing.tokenId);
    const metadata = await resolveTokenMetadata(tokenURI);
    return {
      ...listing,
      tokenURI,
      name: metadata.name,
      description: metadata.description,
      image: metadata.image,
      imageUrl: metadata.imageUrl,
      attributes: metadata.attributes,
    };
  } catch {
    // Token may be burned or metadata unavailable
    return {
      ...listing,
      tokenURI: '',
      name: '',
      description: '',
      image: '',
      imageUrl: '',
      attributes: [],
    };
  }
}

/**
 * GET /api/marketplace/listings
 * Returns all marketplace listings with resolved NFT metadata.
 */
router.get('/listings', async (req, res, next) => {
  try {
    const force = req.query && req.query.force === '1';
    var data = await fetchWithDedup('listings', async function () {
      const marketplace = getMarketplaceContract();
      const nftContract = getContract();

      const totalListingsValue = await callOptional(marketplace, 'getTotalListings', [], null);
      const totalListings = totalListingsValue != null ? Number(totalListingsValue) : null;

      if (totalListings == null) {
        const fallbackListings = getListingsFromEventStore();
        const enrichedFallbackListings = await Promise.all(
          fallbackListings.map(function (listing) { return enrichListingWithMetadata(listing, nftContract); })
        );
        return {
          success: true,
          count: enrichedFallbackListings.length,
          totalListings: enrichedFallbackListings.length,
          listings: enrichedFallbackListings,
          stale: true,
        };
      }

      if (totalListings === 0) {
        return { success: true, count: 0, listings: [] };
      }

      let listingIds = await callOptional(marketplace, 'getAllListingIds', [], null);
      if (!Array.isArray(listingIds)) {
        // Fallback: iterate from 0 to totalListings-1
        listingIds = getFallbackListingIds(totalListings);
      }

      // FIX: Batch listing fetches 3 at a time to avoid CU bursts
      var listings = [];
      var BATCH = 3;
      for (var i = 0; i < listingIds.length; i += BATCH) {
        var batch = listingIds.slice(i, i + BATCH);
        var batchPromises = batch.map(async function (id) {
          try {
            const raw = await marketplace.getListing(Number(id));
            const formatted = formatListing(raw);
            return enrichListingWithMetadata(formatted, nftContract);
          } catch {
            return null;
          }
        });
        var results = await Promise.all(batchPromises);
        for (var j = 0; j < results.length; j++) {
          if (results[j]) listings.push(results[j]);
        }
      }

      if (listings.length === 0 && totalListings > 0) {
        const fallbackListings = getListingsFromEventStore();
        const enrichedFallbackListings = await Promise.all(
          fallbackListings.map(function (listing) { return enrichListingWithMetadata(listing, nftContract); })
        );
        return {
          success: true,
          count: enrichedFallbackListings.length,
          totalListings: Math.max(totalListings, enrichedFallbackListings.length),
          listings: enrichedFallbackListings,
          stale: true,
        };
      }

      return { success: true, count: listings.length, totalListings: totalListings, listings: listings };
    }, force);

    res.json(data);
  } catch (err) {
    console.error('❌ GET /api/marketplace/listings error:', err.message);
    var fallback = getLastGood('listings');
    if (fallback) return res.json(fallback);
    res.json({ success: true, count: 0, listings: [] });
  }
});

/**
 * GET /api/marketplace/listings/active
 * Returns only active marketplace listings with resolved metadata.
 */
router.get('/listings/active', async (req, res, next) => {
  try {
    const force = req.query && req.query.force === '1';
    var data = await fetchWithDedup('active_listings', async function () {
      const marketplace = getMarketplaceContract();
      const nftContract = getContract();

      let activeListings = null;
      const rawActive = await callOptional(marketplace, 'getActiveListings', [], null);
      if (Array.isArray(rawActive)) {
        activeListings = rawActive.map(formatListing);
      } else {
        // Fallback: fetch all and filter active
        const totalListingsValue = await callOptional(marketplace, 'getTotalListings', [], null);
        const totalListings = totalListingsValue != null ? Number(totalListingsValue) : null;
        if (totalListings === 0) {
          return { success: true, count: 0, listings: [] };
        }

        if (totalListings == null) {
          activeListings = getListingsFromEventStore({ activeOnly: true });
        } else {
          let listingIds = await callOptional(marketplace, 'getAllListingIds', [], null);
          if (!Array.isArray(listingIds)) {
            listingIds = getFallbackListingIds(totalListings);
          }

          // FIX: Batch 3 at a time
          activeListings = [];
          var BATCH = 3;
          for (var i = 0; i < listingIds.length; i += BATCH) {
            var batch = listingIds.slice(i, i + BATCH);
            var batchPromises = batch.map(async function (id) {
              try {
                const raw = await marketplace.getListing(Number(id));
                const formatted = formatListing(raw);
                return formatted.active ? formatted : null;
              } catch {
                return null;
              }
            });
            var results = await Promise.all(batchPromises);
            for (var j = 0; j < results.length; j++) {
              if (results[j]) activeListings.push(results[j]);
            }
          }
        }
      }

      // Enrich with metadata — batched 3 at a time
      var listings = [];
      var ENRICH_BATCH = 3;
      for (var i = 0; i < activeListings.length; i += ENRICH_BATCH) {
        var batch = activeListings.slice(i, i + ENRICH_BATCH);
        var enriched = await Promise.all(
          batch.map(function (listing) { return enrichListingWithMetadata(listing, nftContract); })
        );
        for (var j = 0; j < enriched.length; j++) {
          listings.push(enriched[j]);
        }
      }

      return { success: true, count: listings.length, listings: listings };
    }, force);

    res.json(data);
  } catch (err) {
    console.error('❌ GET /api/marketplace/listings/active error:', err.message);
    var fallback = getLastGood('active_listings');
    if (fallback) return res.json(fallback);
    res.json({ success: true, count: 0, listings: [] });
  }
});

/**
 * GET /api/marketplace/listings/:listingId
 * Returns a single listing with metadata and bid history.
 */
router.get('/listings/:listingId', async (req, res, next) => {
  try {
    const listingId = parseInt(req.params.listingId, 10);
    if (isNaN(listingId) || listingId < 0) {
      return res.status(400).json({ success: false, error: 'Invalid listing ID' });
    }

    const marketplace = getMarketplaceContract();
    const nftContract = getContract();

    const raw = await marketplace.getListing(listingId);
    const formatted = formatListing(raw);
    const enriched = await enrichListingWithMetadata(formatted, nftContract);

    // Get bid history
    let bids = [];
    try {
      const rawBids = await marketplace.getListingBids(listingId);
      bids = rawBids.map(formatBid);
    } catch {
      // Listing may not have bids or may not be an auction
    }

    res.json({ success: true, listing: { ...enriched, bids } });
  } catch (err) {
    if (isMissingMethodError(err) || isRateLimitError(err)) {
      const fallbackListing = getListingFromEventStore(listingId);
      if (fallbackListing) {
        const nftContract = getContract();
        const enriched = await enrichListingWithMetadata(fallbackListing, nftContract);
        return res.json({ success: true, listing: { ...enriched, bids: [] }, stale: true });
      }
    }

    if (err.reason || err.code === 'CALL_EXCEPTION') {
      const fallbackListing = getListingFromEventStore(listingId);
      if (fallbackListing) {
        const nftContract = getContract();
        const enriched = await enrichListingWithMetadata(fallbackListing, nftContract);
        return res.json({ success: true, listing: { ...enriched, bids: [] }, stale: true });
      }
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }
    next(err);
  }
});

/**
 * GET /api/marketplace/listings/:listingId/bids
 * Returns bid history for a specific listing.
 */
router.get('/listings/:listingId/bids', async (req, res, next) => {
  try {
    const listingId = parseInt(req.params.listingId, 10);
    if (isNaN(listingId) || listingId < 0) {
      return res.status(400).json({ success: false, error: 'Invalid listing ID' });
    }

    const marketplace = getMarketplaceContract();

    const rawBids = await marketplace.getListingBids(listingId);
    const bids = rawBids.map(formatBid);

    res.json({ success: true, listingId, count: bids.length, bids });
  } catch (err) {
    if (isMissingMethodError(err) || isRateLimitError(err)) {
      return res.json({ success: true, listingId, count: 0, bids: [], stale: true });
    }

    if (err.reason || err.code === 'CALL_EXCEPTION') {
      return res.status(404).json({ success: false, error: 'Listing not found or no bids available' });
    }
    next(err);
  }
});

router.post('/cache/clear', async (req, res, next) => {
  try {
    clearMarketplaceCaches();
    console.log('✅ Marketplace cache cleared (listings, active_listings, and last-good fallbacks)');
    res.json({ success: true, message: 'Marketplace cache cleared successfully' });
  } catch (err) {
    console.error('❌ Marketplace cache clear failed:', err);
    res.status(500).json({ success: false, error: 'Marketplace cache clear failed' });
  }
});

router.clearRouteCache = clearMarketplaceCaches;

module.exports = router;
