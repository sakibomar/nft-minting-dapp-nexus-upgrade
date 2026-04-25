const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const { callOptional, getContract, getProvider, CONTRACT_ADDRESS, isRateLimitError } = require('../config/contract');
const { resolveTokenMetadata } = require('../utils/ipfs');

/** Per-token timeout in ms — if one token takes too long, skip its metadata */
const TOKEN_TIMEOUT_MS = 30000;

/** Track burned/inaccessible tokens — only log warning once per token */
const knownBurnedTokens = new Set();

/* ══════════════════════════════════════════════════════════════════════
   RESPONSE CACHE + INFLIGHT DEDUPLICATION
   
   FIX APPLIED:
     1. Cache TTL: 5s → 30s (dramatically reduces repeat RPC calls)
     2. Inflight dedup: multiple tabs hitting the same endpoint simultaneously
        share a single Promise instead of each spawning separate RPC calls.
        This alone cuts CU consumption by 50-80% on page load.
     3. /api/nfts/owner/:addr reuses the all_nfts cache instead of re-fetching
     4. /api/nfts/stats reuses the all_nfts cache for owner counting
     5. Token fetching batched (3 at a time) to avoid CU bursts
   ══════════════════════════════════════════════════════════════════════ */
var _cache = {};
var _lastGood = {};  // Never expires — used as fallback when RPC fails
var CACHE_TTL = 30000; // FIX: was 5000 — 30 seconds prevents constant re-fetching

/** Inflight promise map — prevents duplicate concurrent fetches */
var FORCE_REFRESH_GRACE_MS = 5000;
var _tokenIdCache = { ids: null, time: 0 };
var _inflight = {};

function getCached(key) {
  var entry = _cache[key];
  if (entry && (Date.now() - entry.time) < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  _cache[key] = { data: data, time: Date.now() };
  _lastGood[key] = data; // Always keep last successful response
}

function clearCacheEntry(key) {
  delete _cache[key];
  delete _lastGood[key];
  delete _inflight[key];
}

function clearNftCaches() {
  clearCacheEntry('all_nfts');
  clearCacheEntry('stats');
  _tokenIdCache = { ids: null, time: 0 };
}

/** Returns last successful response regardless of age, or null */
function getLastGood(key) {
  return _lastGood[key] || null;
}

function isBurnedTokenError(err) {
  var msg = String((err && err.message) || '').toLowerCase();
  return !!(err && (
    err.code === 'CALL_EXCEPTION' ||
    msg.indexOf('nonexistent token') !== -1 ||
    msg.indexOf('erc721nonexistenttoken') !== -1 ||
    msg.indexOf('invalid token id') !== -1 ||
    msg.indexOf('missing revert data') !== -1
  ));
}

function getCachedTokenIds() {
  if (_tokenIdCache.ids && (Date.now() - _tokenIdCache.time) < CACHE_TTL) {
    return _tokenIdCache.ids;
  }
  return null;
}

function setCachedTokenIds(tokenIds) {
  _tokenIdCache = {
    ids: Array.isArray(tokenIds) ? tokenIds.slice() : [],
    time: Date.now(),
  };
}

function getTokenIdsFromEventStore() {
  try {
    var eventStore = require('../cache/eventStore');
    var events = eventStore.getAllEvents();
    var seen = new Set();
    var tokenIds = [];

    for (var i = 0; i < events.length; i++) {
      var tokenId = Number(events[i] && events[i].tokenId);
      if (!Number.isFinite(tokenId) || tokenId < 0 || seen.has(tokenId)) continue;
      seen.add(tokenId);
      tokenIds.push(tokenId);
    }

    tokenIds.sort(function (a, b) { return a - b; });
    return tokenIds;
  } catch (_err) {
    return [];
  }
}

async function fetchTokenIdsFromTransferApi(provider) {
  var result = await provider.send('alchemy_getAssetTransfers', [{
    contractAddresses: [CONTRACT_ADDRESS.toLowerCase()],
    category: ['erc721'],
    withMetadata: false,
    order: 'desc',
    maxCount: '0x3e8',
    fromBlock: '0x0',
    toBlock: 'latest',
  }]);

  var transfers = (result && result.transfers) ? result.transfers : [];
  var seen = new Set();
  var tokenIds = [];

  for (var i = 0; i < transfers.length; i++) {
    var transfer = transfers[i];
    var rawId = transfer.erc721TokenId || transfer.tokenId;
    if (rawId == null) continue;

    var tokenId = typeof rawId === 'string' && rawId.indexOf('0x') === 0
      ? parseInt(rawId, 16)
      : parseInt(rawId, 10);
    if (isNaN(tokenId) || seen.has(tokenId)) continue;

    seen.add(tokenId);
    tokenIds.push(tokenId);
  }

  tokenIds.sort(function (a, b) { return a - b; });
  return tokenIds;
}

function mergeTokenIds(existingIds, nextIds) {
  var merged = [];
  var seen = new Set();
  var sources = [existingIds, nextIds];

  for (var i = 0; i < sources.length; i++) {
    var ids = Array.isArray(sources[i]) ? sources[i] : [];
    for (var j = 0; j < ids.length; j++) {
      var tokenId = Number(ids[j]);
      if (!Number.isFinite(tokenId) || tokenId < 0 || seen.has(tokenId)) continue;
      seen.add(tokenId);
      merged.push(tokenId);
    }
  }

  merged.sort(function (a, b) { return a - b; });
  return merged;
}

function inferTokenStart(totalMinted, discoveredTokenIds) {
  if (!Array.isArray(discoveredTokenIds) || discoveredTokenIds.length === 0) {
    return 0;
  }

  var minTokenId = discoveredTokenIds[0];
  var maxTokenId = discoveredTokenIds[discoveredTokenIds.length - 1];

  if (discoveredTokenIds.indexOf(0) !== -1) {
    return 0;
  }

  if ((maxTokenId - minTokenId + 1) === totalMinted) {
    return minTokenId;
  }

  if (discoveredTokenIds.indexOf(1) !== -1) {
    return 1;
  }

  if (discoveredTokenIds.length === totalMinted) {
    return minTokenId;
  }

  return 0;
}

function buildSequentialTokenIds(totalMinted, startTokenId) {
  return Array.from({ length: totalMinted }, function (_, idx) {
    return startTokenId + idx;
  });
}

async function getMintedTokenIds(contract) {
  var cachedIds = getCachedTokenIds();
  if (cachedIds) return cachedIds;

  var discoveredTokenIds = [];

  var allNftsData = getCached('all_nfts') || getLastGood('all_nfts');
  if (allNftsData && Array.isArray(allNftsData.nfts) && allNftsData.nfts.length > 0) {
    var cachedTokenIds = allNftsData.nfts
      .map(function (nft) { return Number(nft.tokenId); })
      .filter(function (tokenId) { return Number.isFinite(tokenId) && tokenId >= 0; })
      .sort(function (a, b) { return a - b; });

    discoveredTokenIds = mergeTokenIds(discoveredTokenIds, cachedTokenIds);
  }

  var eventStoreTokenIds = getTokenIdsFromEventStore();
  discoveredTokenIds = mergeTokenIds(discoveredTokenIds, eventStoreTokenIds);

  try {
    var totalMinted = Number(await callOptional(contract, 'getTotalMinted', [], NaN));
    if (Number.isFinite(totalMinted) && totalMinted >= 0) {
      if (
        discoveredTokenIds.length === 0 ||
        discoveredTokenIds.length < totalMinted ||
        discoveredTokenIds.indexOf(0) === -1
      ) {
        try {
          var provider = getProvider();
          discoveredTokenIds = mergeTokenIds(discoveredTokenIds, await fetchTokenIdsFromTransferApi(provider));
        } catch (_transferErr) {
          // Ignore and fall back to the contract counter.
        }
      }

      if (discoveredTokenIds.length === totalMinted) {
        setCachedTokenIds(discoveredTokenIds);
        return discoveredTokenIds;
      }

      var startTokenId = inferTokenStart(totalMinted, discoveredTokenIds);
      var sequentialIds = buildSequentialTokenIds(totalMinted, startTokenId);
      setCachedTokenIds(sequentialIds);
      return sequentialIds;
    }
  } catch (_err) {
    // Older deployments may not expose getTotalMinted().
  }

  if (discoveredTokenIds.length > 0) {
    setCachedTokenIds(discoveredTokenIds);
    return discoveredTokenIds;
  }

  try {
    var provider = getProvider();
    var transferTokenIds = await fetchTokenIdsFromTransferApi(provider);
    if (transferTokenIds.length > 0) {
      setCachedTokenIds(transferTokenIds);
      return transferTokenIds;
    }
  } catch (_err2) {
    // Ignore and let route-level fallbacks handle it.
  }

  return [];
}

/**
 * Fetch data with deduplication.
 * If cache is fresh, return it immediately.
 * If another request is already fetching the same key, wait for it.
 * Otherwise, start a new fetch and let subsequent requests share the promise.
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

  // 2. If already fetching this key, piggyback on the existing promise
  if (_inflight[key]) return _inflight[key];

  // 3. Start new fetch — all concurrent requests will share this promise
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
 * Race a promise against a timeout. Rejects with 'Timeout' on expiry.
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

/**
 * Helper: Fetch a single NFT by tokenId with resolved metadata and royalty info.
 * Returns partial data (without metadata) if IPFS is slow, null if token is burned.
 */
async function fetchNftData(contract, tokenId) {
  try {
    const id = Number(tokenId);

    // Step 1: Get on-chain data (fast — direct RPC calls)
    const [tokenURI, owner, creator] = await Promise.all([
      contract.tokenURI(id),
      contract.ownerOf(id),
      callOptional(contract, 'getCreator', [id], ethers.ZeroAddress),
    ]);

    // Step 2: Get royalty info
    let royaltyBps = 0;
    try {
      const [, royaltyAmount] = await contract.royaltyInfo(id, 10000);
      royaltyBps = Number(royaltyAmount);
    } catch {
      // Contract may not support royaltyInfo for this token
    }

    // Step 3: Resolve IPFS metadata with timeout — don't let slow IPFS kill the request
    let metadata = { name: '', description: '', image: '', imageUrl: '', attributes: [] };
    try {
      metadata = await withTimeout(resolveTokenMetadata(tokenURI), TOKEN_TIMEOUT_MS);
    } catch {
      console.warn(`⚠️ Metadata timeout for token ${id}, returning basic data`);
    }

    return {
      tokenId: id,
      tokenURI,
      owner,
      creator,
      royaltyBps,
      name: metadata.name || `NFT #${id}`,
      description: metadata.description,
      image: metadata.image,
      imageUrl: metadata.imageUrl,
      attributes: metadata.attributes,
    };
  } catch (err) {
    if (isRateLimitError(err)) {
      throw err;
    }

    if (!isBurnedTokenError(err)) {
      throw err;
    }
    // Token may be burned or otherwise inaccessible — skip it
    // Only log the warning once per token to avoid console spam
    if (!knownBurnedTokens.has(Number(tokenId))) {
      knownBurnedTokens.add(Number(tokenId));
      console.warn(`⚠️ Token ${tokenId} burned/inaccessible (will skip silently from now on)`);
    }
    return null;
  }
}

/**
 * Fetch all NFTs in small batches to avoid CU bursts.
 * With 5+ tokens × 4 RPC calls each, Promise.all fires 20+ calls simultaneously.
 * Batching 3 at a time keeps burst under 12 calls = ~312 CU — well within budget.
 */
async function fetchAllNfts() {
  var contract = getContract();
  var tokenIds = await getMintedTokenIds(contract);

  var nfts = [];
  var BATCH = 3;
  for (var i = 0; i < tokenIds.length; i += BATCH) {
    var batch = [];
    for (var j = i; j < Math.min(i + BATCH, tokenIds.length); j++) {
      batch.push(fetchNftData(contract, tokenIds[j]));
    }
    var settled = await Promise.allSettled(batch);
    for (var k = 0; k < settled.length; k++) {
      if (settled[k].status === 'fulfilled' && settled[k].value !== null) {
        nfts.push(settled[k].value);
      }
    }
  }

  return { success: true, count: nfts.length, totalMinted: tokenIds.length, nfts: nfts };
}

/**
 * GET /api/nfts
 * Returns all minted NFTs with resolved metadata.
 */
router.get('/', async (req, res, next) => {
  try {
    const force = req.query && req.query.force === '1';
    var data = await fetchWithDedup('all_nfts', fetchAllNfts, force);
    res.json(data);
  } catch (err) {
    console.error('❌ GET /api/nfts error:', err.message);
    // Return last-known-good data instead of 500
    var fallback = getLastGood('all_nfts');
    if (fallback) {
      console.log('   ↳ Returning cached data (last successful response)');
      return res.json(fallback);
    }
    // No cache at all — return empty instead of crashing
    res.json({ success: true, count: 0, totalMinted: 0, nfts: [], stale: true });
  }
});

/**
 * GET /api/nfts/total
 * Returns minting statistics.
 */
router.get('/total', async (_req, res, next) => {
  try {
    const contract = getContract();
    const tokenIds = await getMintedTokenIds(contract);
    const allNftsData = getCached('all_nfts') || getLastGood('all_nfts');

    const [totalSupplyValue, maxSupplyValue, mintPriceValue, burnedCountValue] = await Promise.all([
      callOptional(contract, 'totalSupply', [], null),
      callOptional(contract, 'maxSupply', [], null),
      callOptional(contract, 'mintPrice', [], 0n),
      callOptional(contract, 'getBurnedCount', [], null),
    ]);

    const totalMinted = tokenIds.length;
    const totalSupply = totalSupplyValue != null
      ? Number(totalSupplyValue)
      : (allNftsData && Array.isArray(allNftsData.nfts) ? allNftsData.nfts.length : 0);
    const burnedCount = burnedCountValue != null
      ? Number(burnedCountValue)
      : Math.max(0, totalMinted - totalSupply);
    const maxSupply = maxSupplyValue != null ? Number(maxSupplyValue) : totalMinted;
    const mintPrice = mintPriceValue != null ? mintPriceValue : 0n;

    res.json({
      success: true,
      totalMinted: totalMinted,
      totalSupply: totalSupply,
      maxSupply: maxSupply,
      mintPrice: ethers.formatEther(mintPrice),
      burnedCount: burnedCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/nfts/stats
 * Returns aggregated collection statistics.
 *
 * FIX: Reuses the all_nfts cache for owner counting instead of
 * firing separate ownerOf(i) calls for every token (was N × 26 CU = 130+ CU).
 */
router.get('/stats', async (req, res, next) => {
  try {
    const force = req.query && req.query.force === '1';
    var data = await fetchWithDedup('stats', async function () {
      const contract = getContract();
      const provider = getProvider();
      const tokenIds = await getMintedTokenIds(contract);
      const allNftsData = getCached('all_nfts') || getLastGood('all_nfts');

      const [
        totalSupplyResult,
        maxSupplyResult,
        mintPriceResult,
        burnedCountResult,
        isPausedResult,
        contractOwnerResult,
      ] = await Promise.allSettled([
        callOptional(contract, 'totalSupply', [], null),
        callOptional(contract, 'maxSupply', [], null),
        callOptional(contract, 'mintPrice', [], 0n),
        callOptional(contract, 'getBurnedCount', [], null),
        callOptional(contract, 'paused', [], false),
        callOptional(contract, 'owner', [], ethers.ZeroAddress),
      ]);

      let contractBalance = 0n;
      try {
        contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
      } catch (_balanceErr) {
        contractBalance = 0n;
      }

      const totalMinted = tokenIds.length;
      const totalSupply = totalSupplyResult.status === 'fulfilled' && totalSupplyResult.value != null
        ? Number(totalSupplyResult.value)
        : (allNftsData && Array.isArray(allNftsData.nfts) ? allNftsData.nfts.length : 0);
      const maxSupply = maxSupplyResult.status === 'fulfilled' && maxSupplyResult.value != null
        ? Number(maxSupplyResult.value)
        : totalMinted;
      const mintPrice = mintPriceResult.status === 'fulfilled' && mintPriceResult.value != null ? mintPriceResult.value : 0n;
      const burnedCount = burnedCountResult.status === 'fulfilled' && burnedCountResult.value != null
        ? Number(burnedCountResult.value)
        : Math.max(0, totalMinted - totalSupply);
      const isPaused = isPausedResult.status === 'fulfilled' ? !!isPausedResult.value : false;
      const contractOwner = contractOwnerResult.status === 'fulfilled'
        ? contractOwnerResult.value
        : ethers.ZeroAddress;

      // FIX: Count unique owners from the all_nfts cache instead of
      // firing N separate ownerOf() calls (saves N × 26 CU)
      const ownerSet = new Set();
      if (allNftsData && allNftsData.nfts && allNftsData.nfts.length > 0) {
        for (var i = 0; i < allNftsData.nfts.length; i++) {
          if (allNftsData.nfts[i].owner) {
            ownerSet.add(allNftsData.nfts[i].owner.toLowerCase());
          }
        }
      } else {
        // Fallback: fetch owners individually but batched (2 at a time)
        var BATCH = 2;
        for (var i = 0; i < tokenIds.length; i += BATCH) {
          var batch = [];
          for (var j = i; j < Math.min(i + BATCH, tokenIds.length); j++) {
            batch.push(
              contract.ownerOf(tokenIds[j]).then(function (addr) { ownerSet.add(addr.toLowerCase()); }).catch(function () {})
            );
          }
          await Promise.allSettled(batch);
        }
      }

      // Count active marketplace listings + calculate floor price
      let activeListingsCount = 0;
      let floorPrice = null;
      try {
        const { getMarketplaceContract } = require('../config/contract');
        const marketplace = getMarketplaceContract();
        const activeListings = await callOptional(marketplace, 'getActiveListings', [], null);
        activeListingsCount = Array.isArray(activeListings) ? activeListings.length : 0;

        // Floor price = cheapest active listing (non-auction)
        if (Array.isArray(activeListings) && activeListings.length > 0) {
          const fixedPriceListings = activeListings.filter(function (l) { return !l.isAuction && l.active; });
          if (fixedPriceListings.length > 0) {
            var minPrice = fixedPriceListings[0].price;
            for (var i = 1; i < fixedPriceListings.length; i++) {
              if (fixedPriceListings[i].price < minPrice) {
                minPrice = fixedPriceListings[i].price;
              }
            }
            floorPrice = ethers.formatEther(minPrice);
          }
        }
      } catch (_err) {
        // Marketplace may not be deployed or accessible
      }

      // Calculate total volume from cached marketplace events
      var totalVolume = 0;
      try {
        var eventStore = require('../cache/eventStore');
        var allEvents = eventStore.getAllEvents();
        for (var j = 0; j < allEvents.length; j++) {
          var evt = allEvents[j];
          if (
            (evt.eventType === 'sale' || evt.eventType === 'auction_settled' || evt.eventType === 'offer_accepted') &&
            evt.value
          ) {
            totalVolume += parseFloat(evt.value) || 0;
          }
        }
      } catch (_e) {
        // eventStore may not be initialized yet
      }

      return {
        success: true,
        stats: {
          totalMinted: totalMinted,
          totalSupply: totalSupply,
          maxSupply: maxSupply,
          mintPrice: ethers.formatEther(mintPrice),
          mintPriceWei: mintPrice.toString(),
          burnedCount: burnedCount,
          totalBurned: burnedCount,
          remainingSupply: Math.max(0, maxSupply - totalMinted),
          isPaused: isPaused,
          contractOwner: contractOwner,
          contractBalance: ethers.formatEther(contractBalance),
          totalOwners: ownerSet.size,
          totalListings: activeListingsCount,
          floorPrice: floorPrice,
          totalVolume: totalVolume.toFixed(4),
        },
      };
    }, force);

    res.json(data);
  } catch (err) {
    console.error('❌ GET /api/nfts/stats error:', err.message);
    // Return last-known-good stats instead of 500
    var fallback = getLastGood('stats');
    if (fallback) {
      console.log('   ↳ Returning cached stats (last successful response)');
      return res.json(fallback);
    }
    // No cache at all — return zeros instead of crashing
    res.json({
      success: true,
      stats: {
        totalMinted: 0, totalSupply: 0, maxSupply: 0,
        mintPrice: '0.0', mintPriceWei: '0', burnedCount: 0, totalBurned: 0,
        remainingSupply: 0, isPaused: false, contractOwner: '',
        contractBalance: '0.0', totalOwners: 0, totalListings: 0,
        floorPrice: null, totalVolume: '0.0000',
      },
      stale: true,
    });
  }
});

/**
 * GET /api/nfts/owner/:address
 * Returns all NFTs owned by a specific address with resolved metadata.
 *
 * FIX: Reuses the all_nfts cache instead of re-fetching every token from chain.
 * The all_nfts route already fetches all tokens with full metadata — filtering
 * by owner from cache is instant and costs ZERO CU.
 */
router.get('/owner/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ success: false, error: 'Invalid Ethereum address' });
    }

    const force = req.query && req.query.force === '1';

    // FIX: Try to use cached all_nfts data instead of re-fetching everything
    var allNftsData = force ? null : (getCached('all_nfts') || getLastGood('all_nfts'));
    if (!force && allNftsData && allNftsData.nfts) {
      var ownerNfts = allNftsData.nfts.filter(function (nft) {
        return nft.owner.toLowerCase() === address.toLowerCase();
      });
      return res.json({ success: true, count: ownerNfts.length, owner: address, nfts: ownerNfts });
    }

    // Fallback: fetch fresh via dedup (triggers all_nfts fetch if not cached)
    var freshData = await fetchWithDedup('all_nfts', fetchAllNfts, force);
    var nfts = freshData.nfts.filter(function (nft) {
      return nft.owner.toLowerCase() === address.toLowerCase();
    });

    res.json({ success: true, count: nfts.length, owner: address, nfts: nfts });
  } catch (err) {
    console.error('❌ GET /api/nfts/owner error:', err.message);
    var fallbackData = getCached('all_nfts') || getLastGood('all_nfts');
    if (fallbackData && Array.isArray(fallbackData.nfts)) {
      var fallbackNfts = fallbackData.nfts.filter(function (nft) {
        return nft.owner && nft.owner.toLowerCase() === req.params.address.toLowerCase();
      });
      return res.json({
        success: true,
        count: fallbackNfts.length,
        owner: req.params.address,
        nfts: fallbackNfts,
        stale: true,
      });
    }

    res.status(isRateLimitError(err) ? 429 : 500).json({
      success: false,
      error: isRateLimitError(err) ? 'RPC rate limited while loading owned NFTs' : 'Failed to load owned NFTs',
      code: isRateLimitError(err) ? 'RATE_LIMITED' : 'OWNER_FETCH_FAILED',
    });
  }
});

/**
 * GET /api/nfts/:tokenId
 * Returns a single NFT with resolved metadata.
 */
router.get('/:tokenId', async (req, res, next) => {
  try {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (isNaN(tokenId) || tokenId < 0) {
      return res.status(400).json({ success: false, error: 'Invalid token ID' });
    }

    const force = req.query && req.query.force === '1';

    // Try cache first — avoid RPC call if we already have this token
    var allNftsData = force ? null : (getCached('all_nfts') || getLastGood('all_nfts'));
    if (!force && allNftsData && allNftsData.nfts) {
      var found = null;
      for (var i = 0; i < allNftsData.nfts.length; i++) {
        if (allNftsData.nfts[i].tokenId === tokenId) {
          found = allNftsData.nfts[i];
          break;
        }
      }
      if (found) {
        return res.json({ success: true, nft: found });
      }
    }

    const contract = getContract();
    const nft = await fetchNftData(contract, tokenId);

    if (!nft) {
      return res.status(404).json({ success: false, error: 'Token not found or has been burned' });
    }

    res.json({ success: true, nft });
  } catch (err) {
    console.error('❌ GET /api/nfts/' + req.params.tokenId + ' error:', err.message);

    var fallbackData = getCached('all_nfts') || getLastGood('all_nfts');
    if (fallbackData && Array.isArray(fallbackData.nfts)) {
      for (var i = 0; i < fallbackData.nfts.length; i++) {
        if (Number(fallbackData.nfts[i].tokenId) === Number(req.params.tokenId)) {
          return res.json({ success: true, nft: fallbackData.nfts[i], stale: true });
        }
      }
    }

    if (isBurnedTokenError(err)) {
      return res.status(404).json({ success: false, error: 'Token not found or has been burned' });
    }

    if (isRateLimitError(err)) {
      return res.status(503).json({
        success: false,
        error: 'RPC rate limited while loading token',
        code: 'RATE_LIMITED',
      });
    }

    next(err);
  }
});

/**
 * GET /api/nfts/:tokenId/royalty
 * Returns royalty information for a specific token.
 */
router.get('/:tokenId/royalty', async (req, res, next) => {
  try {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (isNaN(tokenId) || tokenId < 0) {
      return res.status(400).json({ success: false, error: 'Invalid token ID' });
    }

    const contract = getContract();

    // Verify token exists
    let owner;
    try {
      owner = await contract.ownerOf(tokenId);
    } catch {
      return res.status(404).json({ success: false, error: 'Token not found or has been burned' });
    }

    const [receiver, royaltyAmount] = await contract.royaltyInfo(tokenId, 10000);
    const royaltyBps = Number(royaltyAmount);
    const royaltyPercent = royaltyBps / 100;

    res.json({
      success: true,
      tokenId,
      owner,
      royalty: {
        receiver,
        royaltyBps,
        royaltyPercent,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/nfts/metadata
 * Save metadata JSON to the local metadata directory.
 */
router.post('/metadata', async (req, res, next) => {
  try {
    const { filename, metadata } = req.body;
    if (!filename || !metadata) {
      return res.status(400).json({ success: false, error: 'filename and metadata are required' });
    }

    const metadataDir = path.join(__dirname, '..', '..', 'metadata');
    if (!fs.existsSync(metadataDir)) fs.mkdirSync(metadataDir, { recursive: true });

    const filePath = path.join(metadataDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));

    res.json({
      success: true,
      message: 'Metadata saved',
      url: `/metadata/${filename}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/nfts/cache/clear
 * Clear all NFT-related caches (all_nfts, stats).
 * Called after burn events to ensure fresh data on next query.
 *
 * FIX for: NFTs disappearing after burn (cache stale state issue)
 */
router.post('/cache/clear', async (req, res, next) => {
  try {
    clearNftCaches();
    console.log('✅ NFT cache cleared (all_nfts, stats, and last-good fallbacks)');
    res.json({ success: true, message: 'Cache cleared successfully' });
  } catch (err) {
    console.error('❌ Cache clear failed:', err);
    res.status(500).json({ success: false, error: 'Cache clear failed' });
  }
});

router.clearRouteCache = clearNftCaches;

module.exports = router;
