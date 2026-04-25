const express = require('express');
const router = express.Router();
const { fetchBinary } = require('../utils/ipfs');

/** @type {Map<string, {data: Buffer, contentType: string, ts: number}>} */
const cache = new Map();
const MAX_CACHE = 200;
const TTL = 30 * 60 * 1000;

/**
 * GET /:cid
 * Proxy IPFS content through the server with in-memory caching.
 * Cache: max 200 entries, 30-minute TTL.
 */
router.get('/:cid', async (req, res) => {
  const { cid } = req.params;
  if (!cid || cid.length < 10) return res.status(400).json({ error: 'Invalid CID' });

  // Check cache
  const cached = cache.get(cid);
  if (cached && Date.now() - cached.ts < TTL) {
    res.set('Content-Type', cached.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    return res.send(cached.data);
  }

  try {
    const result = await fetchBinary(cid);
    if (!result) return res.status(504).json({ error: 'All IPFS gateways failed' });

    // Evict oldest entry if cache is full
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
    cache.set(cid, { data: result.data, contentType: result.contentType, ts: Date.now() });

    res.set('Content-Type', result.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(result.data);
  } catch (err) {
    console.error('IPFS proxy error:', err.message);
    res.status(500).json({ error: 'IPFS fetch failed' });
  }
});

/**
 * DELETE /refresh/:cid
 * Bust the IPFS cache for a specific CID.
 * Used by the "Refresh Metadata" button on the frontend.
 */
router.delete('/refresh/:cid', async (req, res) => {
  const { cid } = req.params;
  if (!cid || cid.length < 10) return res.status(400).json({ error: 'Invalid CID' });

  const deleted = cache.delete(cid);
  res.json({ success: true, cleared: deleted, cid });
});

/**
 * GET /refresh/:tokenId
 * Bust all cached data for a given tokenId by re-fetching its metadata.
 * Clears the disk cache file and in-memory cache entry.
 */
router.get('/refresh/:tokenId', async (req, res) => {
  const tokenId = parseInt(req.params.tokenId, 10);
  if (isNaN(tokenId) || tokenId < 0) {
    return res.status(400).json({ success: false, error: 'Invalid token ID' });
  }

  try {
    const { getContract } = require('../config/contract');
    const { resolveTokenMetadata } = require('../utils/ipfs');
    const path = require('path');
    const fs = require('fs');

    const contract = getContract();
    const tokenURI = await contract.tokenURI(tokenId);

    // Extract CID from tokenURI
    let cid = '';
    if (tokenURI.startsWith('ipfs://')) {
      cid = tokenURI.replace('ipfs://', '');
    } else if (tokenURI.includes('/ipfs/')) {
      cid = tokenURI.split('/ipfs/')[1];
    }

    // Clear in-memory cache
    if (cid) cache.delete(cid);

    // Clear disk cache if exists
    const cacheDir = path.join(__dirname, '..', '.ipfs-cache');
    if (cid && fs.existsSync(path.join(cacheDir, `${cid}.json`))) {
      fs.unlinkSync(path.join(cacheDir, `${cid}.json`));
    }

    // Re-fetch fresh metadata
    const metadata = await resolveTokenMetadata(tokenURI);

    res.json({ success: true, tokenId, message: 'Metadata cache refreshed', metadata });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to refresh metadata: ' + err.message });
  }
});

module.exports = router;
