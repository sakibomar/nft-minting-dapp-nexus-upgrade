const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { getProvider, getContract, getMarketplaceContract, CONTRACT_ADDRESS, MARKETPLACE_ADDRESS } = require('../config/contract');
const eventStore = require('../cache/eventStore');

/** Maximum number of events to return */
const MAX_EVENTS = 200;

// ---------------------------------------------------------------------------
// Route-level response cache — the FULL assembled + enriched response is cached
// so repeat visits (navigating back and forth) return instantly (0ms RPC cost).
// ---------------------------------------------------------------------------
var _responseCache = {};          // key = query string → { json, timestamp }
var RESPONSE_CACHE_TTL = 60000;   // 60 seconds

// ---------------------------------------------------------------------------
// Module-level cache for contract events — prevents re-scanning on every request
// ---------------------------------------------------------------------------
var _contractEventsCache = { events: [], timestamp: 0, refreshing: false };
var CONTRACT_EVENTS_CACHE_TTL = 180000; // 3 minutes
var CONTRACT_EVENT_SCAN_DEPTH = Number(process.env.HISTORY_CONTRACT_SCAN_DEPTH || 30);
var CONTRACT_EVENT_TIMEOUT_MS = Number(process.env.HISTORY_CONTRACT_SCAN_TIMEOUT_MS || 10000);
var SNAPSHOT_CACHE_TTL = 5 * 60 * 1000;
var _listingSnapshotCache = {};
var _offerSnapshotCache = {};

function clearHistoryCaches() {
  _responseCache = {};
  _contractEventsCache = { events: [], timestamp: 0, refreshing: false };
  _listingSnapshotCache = {};
  _offerSnapshotCache = {};
}

/**
 * Race a promise against a timeout. Resolves null on timeout (does NOT reject).
 */
function _withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { resolve(null); }, ms);
    promise.then(function (v) { clearTimeout(timer); resolve(v); })
           .catch(function (e) { clearTimeout(timer); reject(e); });
  });
}

// ---------------------------------------------------------------------------
// Alchemy Transfer API — bypasses eth_getLogs block range limits entirely
// ---------------------------------------------------------------------------

/**
 * Fetch ERC-721 transfer history using Alchemy's alchemy_getAssetTransfers.
 * Works on the free tier with NO block range restrictions.
 * One call returns the full history — no chunking, no rate limit floods.
 */
async function fetchAlchemyTransfers(provider, contractAddr, options) {
  if (!options) options = {};

  var baseParams = {
    contractAddresses: [contractAddr.toLowerCase()],
    category: ['erc721'],
    withMetadata: true,
    order: 'desc',
    maxCount: '0x' + Math.min(MAX_EVENTS, 1000).toString(16),
    fromBlock: '0x0',
    toBlock: 'latest',
  };

  var transfers = [];

  if (options.address) {
    // Two calls: as sender AND as receiver, then deduplicate
    console.log('  🔍 Querying transfers for address ' + options.address + '...');
    var results = await Promise.all([
      provider.send('alchemy_getAssetTransfers', [Object.assign({}, baseParams, { fromAddress: options.address })]),
      provider.send('alchemy_getAssetTransfers', [Object.assign({}, baseParams, { toAddress: options.address })]),
    ]);
    var fromRes = results[0];
    var toRes = results[1];
    var fromTransfers = (fromRes && fromRes.transfers) ? fromRes.transfers : [];
    var toTransfers = (toRes && toRes.transfers) ? toRes.transfers : [];
    var seen = new Set();
    var all = fromTransfers.concat(toTransfers);
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      var key = t.uniqueId || (t.hash + '-' + (t.erc721TokenId || t.tokenId));
      if (!seen.has(key)) {
        seen.add(key);
        transfers.push(t);
      }
    }
  } else {
    // Get ALL ERC-721 transfers for this contract — single call
    console.log('  🔍 Querying all transfers for contract ' + contractAddr + '...');
    var result = await provider.send('alchemy_getAssetTransfers', [baseParams]);
    transfers = (result && result.transfers) ? result.transfers : [];
  }

  return transfers;
}

/**
 * Fallback for non-Alchemy providers (for example localhost / Hardhat).
 * On localhost we scan the full chain; elsewhere we bound the fallback depth.
 */
async function fetchTransferEventsFromLogs(provider, contractAddr, options) {
  if (!options) options = {};

  var currentBlock = await provider.getBlockNumber();
  var startBlock = 0;

  try {
    var network = await provider.getNetwork();
    if (!network || network.chainId !== 31337n) {
      var fallbackDepth = Number(process.env.HISTORY_FALLBACK_DEPTH || 500);
      startBlock = Math.max(0, currentBlock - fallbackDepth);
    }
  } catch (_err) {
    startBlock = Math.max(0, currentBlock - 500);
  }

  var transferContract = new ethers.Contract(contractAddr, [
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  ], provider);

  var logs = await transferContract.queryFilter(transferContract.filters.Transfer(), startBlock, currentBlock);
  var ZERO = ethers.ZeroAddress.toLowerCase();
  var addressFilter = options.address ? options.address.toLowerCase() : null;
  var events = [];

  for (var i = 0; i < logs.length; i++) {
    var log = logs[i];
    var from = log.args[0];
    var to = log.args[1];
    var tokenId = Number(log.args[2]);

    if (
      addressFilter &&
      from.toLowerCase() !== addressFilter &&
      to.toLowerCase() !== addressFilter
    ) {
      continue;
    }

    var eventType = 'transfer';
    if (from.toLowerCase() === ZERO) eventType = 'mint';
    else if (to.toLowerCase() === ZERO) eventType = 'burn';

    events.push({
      eventType: eventType,
      tokenId: tokenId,
      from: from,
      to: to,
      value: null,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      timestamp: null,
      listingId: null,
      offerId: null,
      isAuction: null,
    });
  }

  return events;
}

async function fetchTransferEvents(provider, contractAddr, options) {
  try {
    var transfers = await fetchAlchemyTransfers(provider, contractAddr, options);
    var transferEvents = normalizeTransfers(transfers);
    console.log('  📦 Transfer source: Alchemy API (' + transferEvents.length + ' events)');
    return transferEvents;
  } catch (err) {
    console.warn('⚠️ Alchemy transfer API unavailable, falling back to Transfer log scan:', err.message);
    var fallbackEvents = await fetchTransferEventsFromLogs(provider, contractAddr, options);
    console.log('  📦 Transfer source: direct log scan (' + fallbackEvents.length + ' events)');
    return fallbackEvents;
  }
}

/**
 * Convert Alchemy transfer objects into our normalized event format.
 */
function normalizeTransfers(transfers) {
  var ZERO = '0x0000000000000000000000000000000000000000';

  return transfers.map(function (t) {
    var from = (t.from || '').toLowerCase();
    var to = (t.to || '').toLowerCase();

    var eventType = 'transfer';
    if (from === ZERO) eventType = 'mint';
    else if (to === ZERO) eventType = 'burn';

    // erc721TokenId comes as hex string like "0x0", "0x1"
    var tokenId = null;
    var rawId = t.erc721TokenId || t.tokenId;
    if (rawId != null) {
      tokenId = typeof rawId === 'string' && rawId.indexOf('0x') === 0
        ? parseInt(rawId, 16)
        : parseInt(rawId, 10);
      if (isNaN(tokenId)) tokenId = null;
    }

    // Parse block timestamp from metadata
    var timestamp = null;
    if (t.metadata && t.metadata.blockTimestamp) {
      timestamp = Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000);
    }

    return {
      eventType: eventType,
      tokenId: tokenId,
      from: from === ZERO ? ethers.ZeroAddress : t.from,
      to: to === ZERO ? ethers.ZeroAddress : t.to,
      value: null, // enriched later for mints
      txHash: t.hash || null,
      blockNumber: t.blockNum ? parseInt(t.blockNum, 16) : null,
      timestamp: timestamp,
      listingId: null,
      offerId: null,
      isAuction: null,
    };
  });
}

/**
 * Enrich mint events with the ETH value sent in each minting transaction.
 * Only enriches a limited batch to avoid rate-limiting.
 */
async function enrichMintValues(provider, events) {
  var mints = events.filter(function (e) { return e.eventType === 'mint' && e.txHash; });
  var toEnrich = mints.slice(0, 30);

  // Fetch in small batches to stay under rate limits
  var BATCH = 5;
  for (var i = 0; i < toEnrich.length; i += BATCH) {
    var batch = toEnrich.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async function (event) {
        try {
          var tx = await provider.getTransaction(event.txHash);
          if (tx && tx.value && Number(tx.value) > 0) {
            event.value = ethers.formatEther(tx.value);
          }
        } catch (err) {
          // Ignore — value stays null
        }
      })
    );
    // Small delay between batches to avoid 429s
    if (i + BATCH < toEnrich.length) {
      await new Promise(function (r) { setTimeout(r, 200); });
    }
  }

  return events;
}

/**
 * Apply query-parameter filters to the event list.
 */
function applyFilters(events, filters) {
  var result = events;

  if (filters.address) {
    var addr = filters.address.toLowerCase();
    result = result.filter(function (e) {
      return (e.from && e.from.toLowerCase() === addr) ||
             (e.to && e.to.toLowerCase() === addr);
    });
  }

  if (filters.tokenId !== undefined && filters.tokenId !== null) {
    var tid = Number(filters.tokenId);
    result = result.filter(function (e) { return e.tokenId === tid; });
  }

  if (filters.type) {
    result = result.filter(function (e) { return e.eventType === filters.type; });
  }

  return result;
}

function getNumericTokenId(event) {
  var tokenId = Number(event && event.tokenId);
  return Number.isFinite(tokenId) && tokenId >= 0 ? tokenId : null;
}

function compareEventsAscending(a, b) {
  var blockDiff = Number(a.blockNumber || 0) - Number(b.blockNumber || 0);
  if (blockDiff !== 0) return blockDiff;

  var timeDiff = Number(a.timestamp || 0) - Number(b.timestamp || 0);
  if (timeDiff !== 0) return timeDiff;

  return String(a.txHash || '').localeCompare(String(b.txHash || ''));
}

function getTxTokenKey(txHash, tokenId) {
  return String(txHash || '') + '|' + String(tokenId);
}

function getCachedSnapshot(cache, key) {
  var entry = cache[String(key)];
  if (entry && (Date.now() - entry.timestamp) < SNAPSHOT_CACHE_TTL) {
    return entry.value;
  }
  return null;
}

function setCachedSnapshot(cache, key, value) {
  cache[String(key)] = {
    value: value,
    timestamp: Date.now(),
  };
  return value;
}

function buildListingContext(snapshot, listingId) {
  return {
    listingId: listingId,
    seller: snapshot && snapshot.seller ? snapshot.seller : null,
    tokenId: getNumericTokenId(snapshot),
    price: snapshot && snapshot.price ? snapshot.price : null,
    isAuction: !!(snapshot && snapshot.isAuction),
    highestBid: snapshot && snapshot.highestBid ? snapshot.highestBid : null,
    highestBidder: snapshot && snapshot.highestBidder ? snapshot.highestBidder : null,
    active: snapshot ? snapshot.active !== false : true,
  };
}

function buildOfferContext(snapshot, offerId) {
  return {
    offerId: offerId,
    buyer: snapshot && snapshot.buyer ? snapshot.buyer : null,
    owner: snapshot && snapshot.owner ? snapshot.owner : null,
    tokenId: getNumericTokenId(snapshot),
    amount: snapshot && snapshot.amount ? snapshot.amount : null,
    active: snapshot ? snapshot.active !== false : true,
  };
}

async function enrichMarketplaceSnapshots(events) {
  var enriched = events.map(function (event) { return Object.assign({}, event); });
  var listingIds = [];
  var offerIds = [];
  var seenListingIds = new Set();
  var seenOfferIds = new Set();

  for (var i = 0; i < enriched.length; i++) {
    var event = enriched[i];
    var listingId = Number(event.listingId);
    var offerId = Number(event.offerId);
    var needsContext = event.tokenId == null || !event.from || !event.to || !event.value;

    if (needsContext && Number.isFinite(listingId) && !seenListingIds.has(listingId)) {
      seenListingIds.add(listingId);
      listingIds.push(listingId);
    }

    if (needsContext && Number.isFinite(offerId) && !seenOfferIds.has(offerId)) {
      seenOfferIds.add(offerId);
      offerIds.push(offerId);
    }
  }

  if (listingIds.length === 0 && offerIds.length === 0) {
    return enriched;
  }

  var marketplace;
  try {
    marketplace = getMarketplaceContract();
  } catch (_err) {
    return enriched;
  }

  var listingSnapshots = new Map();
  var offerSnapshots = new Map();
  var BATCH = 4;

  for (var j = 0; j < listingIds.length; j += BATCH) {
    var listingBatch = listingIds.slice(j, j + BATCH);
    var listingResults = await Promise.all(
      listingBatch.map(async function (listingId) {
        var cached = getCachedSnapshot(_listingSnapshotCache, listingId);
        if (cached) return { listingId: listingId, snapshot: cached };

        try {
          var raw = await marketplace.getListing(listingId);
          var snapshot = {
            listingId: Number(raw.listingId),
            seller: raw.seller,
            tokenId: Number(raw.tokenId),
            price: ethers.formatEther(raw.price),
            isAuction: !!raw.isAuction,
            highestBidder: raw.highestBidder,
            highestBid: ethers.formatEther(raw.highestBid),
            active: !!raw.active,
          };
          return { listingId: listingId, snapshot: setCachedSnapshot(_listingSnapshotCache, listingId, snapshot) };
        } catch (_listingErr) {
          return { listingId: listingId, snapshot: null };
        }
      })
    );

    for (var k = 0; k < listingResults.length; k++) {
      if (listingResults[k].snapshot) {
        listingSnapshots.set(listingResults[k].listingId, listingResults[k].snapshot);
      }
    }
  }

  for (var m = 0; m < offerIds.length; m += BATCH) {
    var offerBatch = offerIds.slice(m, m + BATCH);
    var offerResults = await Promise.all(
      offerBatch.map(async function (offerId) {
        var cached = getCachedSnapshot(_offerSnapshotCache, offerId);
        if (cached) return { offerId: offerId, snapshot: cached };

        try {
          var raw = await marketplace.getOffer(offerId);
          var snapshot = {
            offerId: Number(raw.offerId),
            buyer: raw.buyer,
            tokenId: Number(raw.tokenId),
            amount: ethers.formatEther(raw.amount),
            active: !!raw.active,
          };
          return { offerId: offerId, snapshot: setCachedSnapshot(_offerSnapshotCache, offerId, snapshot) };
        } catch (_offerErr) {
          return { offerId: offerId, snapshot: null };
        }
      })
    );

    for (var n = 0; n < offerResults.length; n++) {
      if (offerResults[n].snapshot) {
        offerSnapshots.set(offerResults[n].offerId, offerResults[n].snapshot);
      }
    }
  }

  for (var p = 0; p < enriched.length; p++) {
    var current = enriched[p];
    var currentListingId = Number(current.listingId);
    var currentOfferId = Number(current.offerId);

    if (Number.isFinite(currentListingId) && listingSnapshots.has(currentListingId)) {
      var listingSnapshot = listingSnapshots.get(currentListingId);
      current._listingSnapshot = listingSnapshot;

      if (current.tokenId == null && Number.isFinite(listingSnapshot.tokenId)) {
        current.tokenId = listingSnapshot.tokenId;
      }

      if (!current.value && listingSnapshot.price) {
        current.value = listingSnapshot.price;
      }

      if (
        !current.from &&
        listingSnapshot.seller &&
        (current.eventType === 'listed' || current.eventType === 'sale' || current.eventType === 'price_updated')
      ) {
        current.from = listingSnapshot.seller;
      }

      if (!current.to && current.eventType === 'listed') {
        current.to = MARKETPLACE_ADDRESS;
      }
    }

    if (Number.isFinite(currentOfferId) && offerSnapshots.has(currentOfferId)) {
      var offerSnapshot = offerSnapshots.get(currentOfferId);
      current._offerSnapshot = offerSnapshot;

      if (current.tokenId == null && Number.isFinite(offerSnapshot.tokenId)) {
        current.tokenId = offerSnapshot.tokenId;
      }

      if (!current.value && offerSnapshot.amount) {
        current.value = offerSnapshot.amount;
      }

      if (!current.from && offerSnapshot.buyer && current.eventType === 'offer_made') {
        current.from = offerSnapshot.buyer;
      }
    }
  }

  return enriched;
}

function enrichEventContext(events) {
  var enriched = events.map(function (event) { return Object.assign({}, event); });
  var sorted = enriched.slice().sort(compareEventsAscending);
  var transferByTxToken = new Map();
  var ownerByToken = new Map();
  var listingById = new Map();
  var offerById = new Map();

  for (var i = 0; i < sorted.length; i++) {
    var seedEvent = sorted[i];
    var seedListingId = Number(seedEvent.listingId);
    var seedOfferId = Number(seedEvent.offerId);
    var seedTokenId = getNumericTokenId(seedEvent);

    if (Number.isFinite(seedListingId) && seedEvent._listingSnapshot && !listingById.has(seedListingId)) {
      listingById.set(seedListingId, buildListingContext(seedEvent._listingSnapshot, seedListingId));
    }

    if (Number.isFinite(seedOfferId) && seedEvent._offerSnapshot && !offerById.has(seedOfferId)) {
      offerById.set(seedOfferId, buildOfferContext(seedEvent._offerSnapshot, seedOfferId));
    }

    if (!seedEvent.txHash || seedTokenId === null) continue;
    if (seedEvent.eventType === 'transfer' || seedEvent.eventType === 'mint' || seedEvent.eventType === 'burn') {
      transferByTxToken.set(getTxTokenKey(seedEvent.txHash, seedTokenId), seedEvent);
    }
  }

  for (var j = 0; j < sorted.length; j++) {
    var event = sorted[j];
    var tokenId = getNumericTokenId(event);
    var listingId = Number(event.listingId);
    var offerId = Number(event.offerId);

    if (!Number.isFinite(listingId)) listingId = null;
    if (!Number.isFinite(offerId)) offerId = null;

    if (tokenId === null && event._listingSnapshot) {
      tokenId = getNumericTokenId(event._listingSnapshot);
      if (tokenId !== null) event.tokenId = tokenId;
    }

    if (tokenId === null && event._offerSnapshot) {
      tokenId = getNumericTokenId(event._offerSnapshot);
      if (tokenId !== null) event.tokenId = tokenId;
    }

    if (tokenId !== null) event.tokenId = tokenId;

    if ((event.eventType === 'transfer' || event.eventType === 'mint' || event.eventType === 'burn') && tokenId !== null) {
      if (event.to) {
        ownerByToken.set(tokenId, event.to);
      }
      continue;
    }

    if (event.eventType === 'listed' && listingId !== null) {
      if (!event.to) event.to = MARKETPLACE_ADDRESS;
      listingById.set(listingId, {
        listingId: listingId,
        seller: event.from || null,
        tokenId: tokenId,
        price: event.value || null,
        isAuction: !!event.isAuction,
        highestBid: null,
        highestBidder: null,
        active: true,
      });
      continue;
    }

    var listing = listingId !== null ? listingById.get(listingId) : null;
    if (tokenId === null && listing && listing.tokenId !== null) {
      tokenId = listing.tokenId;
      event.tokenId = tokenId;
    }

    var transfer = (event.txHash && tokenId !== null)
      ? transferByTxToken.get(getTxTokenKey(event.txHash, tokenId))
      : null;

    if (event.eventType === 'sale' && listing) {
      if (!event.from) event.from = listing.seller || (transfer && transfer.from) || null;
      if (!event.to) event.to = (transfer && transfer.to) || null;
      if (!event.value) event.value = listing.price || null;
      listing.active = false;
      listingById.set(listingId, listing);
      continue;
    }

    if (event.eventType === 'bid' && listing) {
      if (!event.to) event.to = MARKETPLACE_ADDRESS;
      if (tokenId === null && listing.tokenId !== null) event.tokenId = listing.tokenId;
      if (event.value) listing.highestBid = event.value;
      if (event.from) listing.highestBidder = event.from;
      listingById.set(listingId, listing);
      continue;
    }

    if (event.eventType === 'bid_refund' && listing) {
      if (!event.from) event.from = MARKETPLACE_ADDRESS;
      if (tokenId === null && listing.tokenId !== null) event.tokenId = listing.tokenId;
      continue;
    }

    if (event.eventType === 'auction_settled' && listing) {
      if (!event.from) event.from = (transfer && transfer.from) || listing.seller || MARKETPLACE_ADDRESS;
      if (!event.to || event.to === ethers.ZeroAddress) {
        event.to = (transfer && transfer.to) || listing.seller || null;
      }
      if (!event.value) event.value = listing.highestBid || listing.price || null;
      listing.active = false;
      listingById.set(listingId, listing);
      continue;
    }

    if (event.eventType === 'listing_cancelled' && listing) {
      if (!event.from) event.from = (transfer && transfer.from) || MARKETPLACE_ADDRESS;
      if (!event.to) event.to = (transfer && transfer.to) || listing.seller || null;
      if (!event.value) event.value = listing.price || null;
      listing.active = false;
      listingById.set(listingId, listing);
      continue;
    }

    if (event.eventType === 'price_updated' && listing) {
      if (!event.from) event.from = listing.seller || null;
      if (!event.to) event.to = MARKETPLACE_ADDRESS;
      if (event.value) listing.price = event.value;
      listingById.set(listingId, listing);
      continue;
    }

    if (event.eventType === 'offer_made' && offerId !== null) {
      if (!event.to && tokenId !== null && ownerByToken.has(tokenId)) {
        event.to = ownerByToken.get(tokenId);
      }
      offerById.set(offerId, {
        offerId: offerId,
        buyer: event.from || null,
        owner: event.to || null,
        tokenId: tokenId,
        amount: event.value || null,
        active: true,
      });
      continue;
    }

    var offer = offerId !== null ? offerById.get(offerId) : null;

    if (event.eventType === 'offer_accepted' && offer) {
      if (tokenId === null && offer.tokenId !== null) event.tokenId = offer.tokenId;
      if (!event.from) event.from = offer.owner || null;
      if (!event.to) event.to = offer.buyer || null;
      if (!event.value) event.value = offer.amount || null;
      offer.active = false;
      offerById.set(offerId, offer);
      continue;
    }

    if (event.eventType === 'offer_cancelled' && offer) {
      if (tokenId === null && offer.tokenId !== null) event.tokenId = offer.tokenId;
      if (!event.from) event.from = MARKETPLACE_ADDRESS;
      if (!event.to) event.to = offer.buyer || null;
      if (!event.value) event.value = offer.amount || null;
      offer.active = false;
      offerById.set(offerId, offer);
      continue;
    }

    if (event.eventType === 'offer_declined' && offer) {
      if (tokenId === null && offer.tokenId !== null) event.tokenId = offer.tokenId;
      if (!event.from) event.from = offer.owner || null;
      if (!event.to) event.to = offer.buyer || null;
      if (!event.value) event.value = offer.amount || null;
      offer.active = false;
      offerById.set(offerId, offer);
    }
  }

  var txValueContext = new Map();
  for (var k = 0; k < enriched.length; k++) {
    var valueEvent = enriched[k];
    var valueTokenId = getNumericTokenId(valueEvent);
    if (!valueEvent.txHash || valueTokenId === null) continue;
    if (
      valueEvent.eventType === 'transfer' ||
      valueEvent.eventType === 'mint' ||
      valueEvent.eventType === 'burn' ||
      valueEvent.eventType === 'approval' ||
      valueEvent.eventType === 'approval_all'
    ) {
      continue;
    }

    var valueKey = getTxTokenKey(valueEvent.txHash, valueTokenId);
    if (!txValueContext.has(valueKey) || (!txValueContext.get(valueKey).value && valueEvent.value)) {
      txValueContext.set(valueKey, { value: valueEvent.value || null });
    }
  }

  for (var m = 0; m < enriched.length; m++) {
    var transferEvent = enriched[m];
    var transferTokenId = getNumericTokenId(transferEvent);
    if (!transferEvent.txHash || transferTokenId === null || transferEvent.value) continue;
    if (
      transferEvent.eventType !== 'transfer' &&
      transferEvent.eventType !== 'mint' &&
      transferEvent.eventType !== 'burn'
    ) {
      continue;
    }

    var transferKey = getTxTokenKey(transferEvent.txHash, transferTokenId);
    var valueContext = txValueContext.get(transferKey);
    if (valueContext && valueContext.value) {
      transferEvent.value = valueContext.value;
    }
  }

  for (var n = 0; n < enriched.length; n++) {
    delete enriched[n]._listingSnapshot;
    delete enriched[n]._offerSnapshot;
  }

  return enriched;
}

// ---------------------------------------------------------------------------
// Contract Event Fetching — marketplace + approval events via queryFilter
//
// FIX APPLIED:
//   1. Scan depth reduced from 5000 → 100 blocks (event store covers the rest)
//   2. Max 2 retries per chunk on 429 (was INFINITE — caused the hang)
//   3. CALL_EXCEPTION skips entire event type (marketplace may be unreachable)
//   4. Results cached for 60s at module level (no re-scan on every request)
//   5. 10-second timeout — route always responds even if scan is slow
//   6. Concurrent refresh prevention — only one scan runs at a time
// ---------------------------------------------------------------------------

/**
 * Raw contract event scan — called by the cached wrapper below.
 * Scans last ~100 blocks with bounded retries.
 */
async function _rawScanContractEvents(provider) {
  var events = [];
  var currentBlock;

  try {
    currentBlock = await provider.getBlockNumber();
  } catch (err) {
    console.warn('⚠️ Could not get block number for contract events:', err.message);
    return events;
  }

  // Scan last ~100 blocks (~5-6 minutes on Sepolia/mainnet)
  // Older history is covered by the event store (populated by poller in index.js)
  // and by the Alchemy Transfer API (covers all ERC-721 transfers with no block limit)
  var startBlock = Math.max(0, currentBlock - CONTRACT_EVENT_SCAN_DEPTH);
  var CHUNK = 9;       // Alchemy free tier: max 10 blocks per eth_getLogs call (inclusive)
  var MAX_RETRIES = 2; // Was INFINITE — this is the fix for the hang

  /**
   * Scan events in chunks of 9 blocks with bounded retry on 429.
   */
  async function scanEvents(contract, eventFilter, parser) {
    for (var from = startBlock; from <= currentBlock; from += CHUNK + 1) {
      var to = Math.min(from + CHUNK, currentBlock);
      var retries = 0;
      var done = false;

      while (!done) {
        try {
          var logs = await contract.queryFilter(eventFilter, from, to);
          for (var j = 0; j < logs.length; j++) {
            try {
              var parsed = parser(logs[j]);
              if (parsed) events.push(parsed);
            } catch (parseErr) {
              // Skip unparseable log
            }
          }
          done = true;
        } catch (err) {
          var msg = (err && err.message) ? err.message : '';

          if (msg.indexOf('429') !== -1 || msg.indexOf('too many') !== -1 || msg.indexOf('Too Many') !== -1) {
            retries++;
            if (retries > MAX_RETRIES) {
              // FIXED: was `from -= CHUNK + 1` (infinite retry). Now we skip the chunk.
              console.warn('  ⚠️ Rate limited on chunk ' + from + '-' + to + ', skipping after ' + MAX_RETRIES + ' retries');
              done = true;
            } else {
              // Exponential-ish backoff: 1s, 2s
              await new Promise(function (r) { setTimeout(r, 1000 * retries); });
            }
          } else if (msg.indexOf('CALL_EXCEPTION') !== -1 || msg.indexOf('missing revert') !== -1) {
            // Contract method not available — skip this entire event type
            return;
          } else if (msg.indexOf('range') !== -1 || msg.indexOf('block range') !== -1 || msg.indexOf('exceed') !== -1) {
            console.warn('  ⚠️ Block range error even with chunk=9, skipping:', from, '-', to);
            done = true;
          } else {
            console.warn('  ⚠️ Event scan error for range', from, '-', to, ':', msg);
            done = true; // Skip chunk on other errors
          }
        }
      }
    }
  }

  var nftContract = getContract();
  var marketplace = getMarketplaceContract();

  // ── NFT Contract Events ─────────────────────────────────────────────

  // Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)
  try {
    await scanEvents(nftContract, nftContract.filters.Approval(), function (log) {
      return {
        eventType: 'approval',
        tokenId: Number(log.args[2]),
        from: log.args[0],  // owner
        to: log.args[1],    // approved address
        value: null,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: null,
        offerId: null,
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning Approval events:', err.message);
  }

  // ApprovalForAll(address indexed owner, address indexed operator, bool approved)
  try {
    await scanEvents(nftContract, nftContract.filters.ApprovalForAll(), function (log) {
      return {
        eventType: 'approval_all',
        tokenId: null,
        from: log.args[0],  // owner
        to: log.args[1],    // operator
        value: null,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: null,
        offerId: null,
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning ApprovalForAll events:', err.message);
  }

  // ── Marketplace Events ──────────────────────────────────────────────

  // Listed(uint256 indexed listingId, address indexed seller, address nftContract, uint256 indexed tokenId, uint256 price, bool isAuction, uint256 auctionEndTime)
  try {
    await scanEvents(marketplace, marketplace.filters.Listed(), function (log) {
      return {
        eventType: 'listed',
        tokenId: Number(log.args[3]),    // tokenId
        from: log.args[1],              // seller
        to: null,
        value: ethers.formatEther(log.args[4]),  // price
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: Number(log.args[0]),
        offerId: null,
        isAuction: log.args[5] || false,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning Listed events:', err.message);
  }

  // Sale(uint256 indexed listingId, address indexed buyer, uint256 tokenId, uint256 price)
  try {
    await scanEvents(marketplace, marketplace.filters.Sale(), function (log) {
      return {
        eventType: 'sale',
        tokenId: Number(log.args[2]),    // tokenId
        from: null,                      // seller not in event, could be looked up
        to: log.args[1],                // buyer
        value: ethers.formatEther(log.args[3]),  // price
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: Number(log.args[0]),
        offerId: null,
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning Sale events:', err.message);
  }

  // BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 amount)
  try {
    await scanEvents(marketplace, marketplace.filters.BidPlaced(), function (log) {
      return {
        eventType: 'bid',
        tokenId: null,
        from: log.args[1],   // bidder
        to: null,
        value: ethers.formatEther(log.args[2]),  // amount
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: Number(log.args[0]),
        offerId: null,
        isAuction: true,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning BidPlaced events:', err.message);
  }

  // BidRefunded(uint256 indexed listingId, address indexed bidder, uint256 amount)
  try {
    await scanEvents(marketplace, marketplace.filters.BidRefunded(), function (log) {
      return {
        eventType: 'bid_refund',
        tokenId: null,
        from: null,
        to: log.args[1],    // bidder (receiving refund)
        value: ethers.formatEther(log.args[2]),  // amount
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: Number(log.args[0]),
        offerId: null,
        isAuction: true,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning BidRefunded events:', err.message);
  }

  // AuctionSettled(uint256 indexed listingId, address indexed winner, uint256 amount)
  try {
    await scanEvents(marketplace, marketplace.filters.AuctionSettled(), function (log) {
      return {
        eventType: 'auction_settled',
        tokenId: null,
        from: null,
        to: log.args[1],    // winner
        value: ethers.formatEther(log.args[2]),  // amount
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: Number(log.args[0]),
        offerId: null,
        isAuction: true,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning AuctionSettled events:', err.message);
  }

  // ListingCancelled(uint256 indexed listingId)
  try {
    await scanEvents(marketplace, marketplace.filters.ListingCancelled(), function (log) {
      return {
        eventType: 'listing_cancelled',
        tokenId: null,
        from: null,
        to: null,
        value: null,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: Number(log.args[0]),
        offerId: null,
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning ListingCancelled events:', err.message);
  }

  // ListingPriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice)
  try {
    await scanEvents(marketplace, marketplace.filters.ListingPriceUpdated(), function (log) {
      return {
        eventType: 'price_updated',
        tokenId: null,
        from: null,
        to: null,
        value: ethers.formatEther(log.args[2]),  // newPrice
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: Number(log.args[0]),
        offerId: null,
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning ListingPriceUpdated events:', err.message);
  }

  // OfferMade(uint256 indexed offerId, address indexed buyer, address nftContract, uint256 indexed tokenId, uint256 amount, uint256 expiresAt)
  try {
    await scanEvents(marketplace, marketplace.filters.OfferMade(), function (log) {
      return {
        eventType: 'offer_made',
        tokenId: Number(log.args[3]),    // tokenId
        from: log.args[1],              // buyer
        to: null,
        value: ethers.formatEther(log.args[4]),  // amount
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: null,
        offerId: Number(log.args[0]),
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning OfferMade events:', err.message);
  }

  // OfferAccepted(uint256 indexed offerId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 amount)
  try {
    await scanEvents(marketplace, marketplace.filters.OfferAccepted(), function (log) {
      return {
        eventType: 'offer_accepted',
        tokenId: Number(log.args[3]),    // tokenId
        from: log.args[1],              // seller
        to: log.args[2],                // buyer
        value: ethers.formatEther(log.args[4]),  // amount
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: null,
        offerId: Number(log.args[0]),
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning OfferAccepted events:', err.message);
  }

  // OfferCancelled(uint256 indexed offerId)
  try {
    await scanEvents(marketplace, marketplace.filters.OfferCancelled(), function (log) {
      return {
        eventType: 'offer_cancelled',
        tokenId: null,
        from: null,
        to: null,
        value: null,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: null,
        offerId: Number(log.args[0]),
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning OfferCancelled events:', err.message);
  }

  // OfferDeclined(uint256 indexed offerId, address indexed owner)
  try {
    await scanEvents(marketplace, marketplace.filters.OfferDeclined(), function (log) {
      return {
        eventType: 'offer_declined',
        tokenId: null,
        from: log.args[1],              // owner (decliner)
        to: null,
        value: null,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
        listingId: null,
        offerId: Number(log.args[0]),
        isAuction: null,
      };
    });
  } catch (err) {
    console.warn('⚠️ Error scanning OfferDeclined events:', err.message);
  }

  return events;
}

/**
 * Cached wrapper around _rawScanContractEvents.
 *
 * - Returns cached results if under 60s old (instant).
 * - Only one scan runs at a time (prevents concurrent request stampede).
 * - 10-second timeout — the route always responds, even if the scan is slow.
 * - Falls back to stale cache or empty array on failure.
 */
async function fetchContractEvents(provider) {
  // Serve from cache if fresh
  var age = Date.now() - _contractEventsCache.timestamp;
  if (_contractEventsCache.timestamp > 0 && age < CONTRACT_EVENTS_CACHE_TTL) {
    console.log('  📦 Contract events cache hit (' + _contractEventsCache.events.length + ' events, ' + Math.round(age / 1000) + 's old)');
    return _contractEventsCache.events;
  }

  // Prevent concurrent refreshes — second request gets stale cache instead of starting another scan
  if (_contractEventsCache.refreshing) {
    console.log('  ⏳ Contract events scan already in progress — returning stale cache');
    return _contractEventsCache.events;
  }
  _contractEventsCache.refreshing = true;

  try {
    var result = await _withTimeout(_rawScanContractEvents(provider), CONTRACT_EVENT_TIMEOUT_MS);
    if (result !== null) {
      _contractEventsCache = { events: result, timestamp: Date.now(), refreshing: false };
      console.log('  📦 Contract events cache refreshed: ' + result.length + ' events');
      return result;
    } else {
      console.warn('  ⚠️ Contract event scan timed out after ' + Math.round(CONTRACT_EVENT_TIMEOUT_MS / 1000) + 's — returning stale cache (' + _contractEventsCache.events.length + ' events)');
    }
  } catch (err) {
    console.warn('  ⚠️ Contract event scan failed:', err.message, '— returning stale cache');
  }

  _contractEventsCache.timestamp = Date.now();
  _contractEventsCache.refreshing = false;
  return _contractEventsCache.events;
}

/**
 * Enrich contract events with block timestamps.
 * Batch-fetches timestamps for unique block numbers (limited to 100 blocks).
 */
async function enrichTimestamps(provider, events) {
  // Collect unique block numbers that have no timestamp
  var blockSet = new Set();
  for (var i = 0; i < events.length; i++) {
    if (events[i].timestamp === null && events[i].blockNumber != null) {
      blockSet.add(events[i].blockNumber);
    }
  }

  var uniqueBlocks = Array.from(blockSet);
  // Limit to first 100 unique blocks to avoid rate limits
  uniqueBlocks = uniqueBlocks.slice(0, 100);

  if (uniqueBlocks.length === 0) return events;

  var blockTimestamps = {};
  var BATCH = 5;

  for (var i = 0; i < uniqueBlocks.length; i += BATCH) {
    var batch = uniqueBlocks.slice(i, i + BATCH);
    var results = await Promise.all(
      batch.map(function (bn) {
        return provider.getBlock(bn).catch(function () { return null; });
      })
    );
    for (var j = 0; j < results.length; j++) {
      if (results[j] && results[j].timestamp) {
        blockTimestamps[batch[j]] = results[j].timestamp;
      }
    }
    // Small delay between batches
    if (i + BATCH < uniqueBlocks.length) {
      await new Promise(function (r) { setTimeout(r, 200); });
    }
  }

  // Apply timestamps to events
  for (var i = 0; i < events.length; i++) {
    if (events[i].timestamp === null && events[i].blockNumber != null) {
      var ts = blockTimestamps[events[i].blockNumber];
      if (ts) events[i].timestamp = ts;
    }
  }

  return events;
}

/**
 * Deduplicate events by txHash + eventType + tokenId combination.
 */
function deduplicateEvents(events) {
  var seen = new Set();
  var result = [];
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    var key = [
      e.txHash || '',
      e.eventType || '',
      e.tokenId != null ? e.tokenId : 'null',
      e.listingId != null ? e.listingId : 'null',
      e.offerId != null ? e.offerId : 'null',
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/history
 * Query params: ?address=, ?tokenId=, ?type=mint|transfer|burn|listed|sale|bid|...
 */
router.get('/', async function (req, res, next) {
  try {
    var force = req.query && req.query.force === '1';
    // ── Response cache check ─────────────────────────────────────────
    // Keyed on the full query string so filtered requests cache separately.
    var cacheKey = req.originalUrl || req.url;
    var cached = _responseCache[cacheKey];
    if (!force && cached && (Date.now() - cached.timestamp) < RESPONSE_CACHE_TTL) {
      console.log('📜 /api/history — response cache HIT (' + cached.json.count + ' events, ' + Math.round((Date.now() - cached.timestamp) / 1000) + 's old)');
      return res.json(cached.json);
    }

    console.log('📜 Fetching transaction history via Alchemy Transfer API + Contract Events...');
    var provider = getProvider();

    var filters = {
      address: req.query.address || null,
      tokenId: req.query.tokenId !== undefined ? req.query.tokenId : null,
      type: req.query.type || null,
    };

    // 1. Fetch ERC-721 transfers (Alchemy when available, direct log scan otherwise)
    var transferEvents = await fetchTransferEvents(provider, CONTRACT_ADDRESS, {
      address: filters.address,
    });

    // 2. Fetch contract events (marketplace + approvals) — cached with timeout
    var contractEvents = [];
    try {
      contractEvents = await fetchContractEvents(provider);
      console.log('  📦 On-chain scan returned ' + contractEvents.length + ' contract events');
    } catch (err) {
      console.warn('⚠️ Contract event fetch failed (continuing with transfers only):', err.message);
    }

    // 3. Also merge any cached events from the real-time poller (covers older history)
    var cachedEvents = [];
    try {
      cachedEvents = eventStore.getEvents(filters);
      console.log('  📦 Event store returned ' + cachedEvents.length + ' cached events');
    } catch (err) {
      // Event store not available — that's fine, continue without it
    }

    // 4. Merge all sources and deduplicate
    var allEvents = transferEvents.concat(contractEvents).concat(cachedEvents);
    allEvents = deduplicateEvents(allEvents);
    allEvents = await enrichMarketplaceSnapshots(allEvents);

    // 5. Apply filters
    allEvents = enrichEventContext(allEvents);
    allEvents = applyFilters(allEvents, filters);

    // 6. Sort by blockNumber descending
    allEvents.sort(function (a, b) { return (b.blockNumber || 0) - (a.blockNumber || 0); });

    // 7. Limit
    allEvents = allEvents.slice(0, MAX_EVENTS);

    // 8. Enrich mint values and timestamps
    allEvents = await enrichMintValues(provider, allEvents);
    allEvents = await enrichTimestamps(provider, allEvents);

    console.log('  ✅ Returning ' + allEvents.length + ' history events');

    var responseJson = {
      success: true,
      count: allEvents.length,
      events: allEvents,
    };

    // ── Store in response cache ──────────────────────────────────────
    _responseCache[cacheKey] = { json: responseJson, timestamp: Date.now() };

    res.json(responseJson);
  } catch (err) {
    console.error('❌ GET /api/history error:', err.message);
    next(err);
  }
});

/**
 * GET /api/history/:tokenId
 */
router.get('/:tokenId', async function (req, res, next) {
  try {
    var tokenId = parseInt(req.params.tokenId, 10);
    var force = req.query && req.query.force === '1';
    if (isNaN(tokenId) || tokenId < 0) {
      return res.status(400).json({ success: false, error: 'Invalid token ID' });
    }

    // ── Response cache check ───────────────────────────────────────
    var cacheKey = '/api/history/' + tokenId;
    var cached = _responseCache[cacheKey];
    if (!force && cached && (Date.now() - cached.timestamp) < RESPONSE_CACHE_TTL) {
      console.log('📜 /api/history/' + tokenId + ' — response cache HIT');
      return res.json(cached.json);
    }

    console.log('📜 Fetching history for token #' + tokenId + '...');
    var provider = getProvider();

    // Fetch ERC-721 transfers (Alchemy when available, direct log scan otherwise)
    var transferEvents = await fetchTransferEvents(provider, CONTRACT_ADDRESS);

    // Fetch contract events — cached with timeout
    var contractEvents = [];
    try {
      contractEvents = await fetchContractEvents(provider);
    } catch (err) {
      console.warn('⚠️ Contract event fetch failed for token route:', err.message);
    }

    // Also merge cached events from the real-time poller
    var cachedEvents = [];
    try {
      cachedEvents = eventStore.getAllEvents();
    } catch (err) {
      // Event store not available — continue without it
    }

    // Merge, deduplicate, filter by tokenId
    var allEvents = transferEvents.concat(contractEvents).concat(cachedEvents);
    allEvents = deduplicateEvents(allEvents);
    allEvents = await enrichMarketplaceSnapshots(allEvents);
    allEvents = enrichEventContext(allEvents);
    allEvents = allEvents.filter(function (e) { return e.tokenId === tokenId; });
    allEvents.sort(function (a, b) { return (b.blockNumber || 0) - (a.blockNumber || 0); });

    // Enrich
    allEvents = await enrichMintValues(provider, allEvents);
    allEvents = await enrichTimestamps(provider, allEvents);

    console.log('  ✅ Returning ' + allEvents.length + ' events for token #' + tokenId);

    var responseJson = {
      success: true,
      tokenId: tokenId,
      count: allEvents.length,
      events: allEvents,
    };

    // ── Store in response cache ──────────────────────────────────────
    _responseCache[cacheKey] = { json: responseJson, timestamp: Date.now() };

    res.json(responseJson);
  } catch (err) {
    console.error('❌ GET /api/history/' + req.params.tokenId + ' error:', err.message);
    next(err);
  }
});

/**
 * POST /api/history/cache/clear
 * Clears assembled history responses and cached contract-event scans.
 */
router.post('/cache/clear', async function (_req, res) {
  try {
    clearHistoryCaches();
    console.log('✅ History cache cleared (responses + contract event cache)');
    res.json({ success: true, message: 'History cache cleared successfully' });
  } catch (err) {
    console.error('❌ History cache clear failed:', err);
    res.status(500).json({ success: false, error: 'History cache clear failed' });
  }
});

router.clearRouteCache = clearHistoryCaches;

module.exports = router;
