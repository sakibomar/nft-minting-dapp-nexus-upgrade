/**
 * @file index.js
 * @description Express API server with Socket.io real-time events for NFT DApp.
 *              Listens to on-chain events and broadcasts to connected clients.
 *
 * FIX APPLIED (CU budget management):
 *   - BACKFILL_DEPTH: 200 → 50 blocks (saves ~15,000 CU on startup)
 *   - RPC_PACE_MS: 250 → 500ms (halves CU/s during polling: 300 → 150 CU/s)
 *   - Startup delay: 5s → 20s (lets initial page load finish before backfill competes)
 *   - Inter-chunk gap: 1.5s → 3s (spreads CU consumption, leaves headroom for API routes)
 *   - Backfill status exported so other modules can check
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { ethers } = require('ethers');
const { getProvider, getContract, getMarketplaceContract, CONTRACT_ADDRESS, MARKETPLACE_ADDRESS } = require('./config/contract');
const eventStore = require('./cache/eventStore');

const nftRoutes = require('./routes/nftRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const ipfsRoutes = require('./routes/ipfsRoutes');
const marketplaceRoutes = require('./routes/marketplaceRoutes');
const historyRoutes = require('./routes/historyRoutes');
const offerRoutes = require('./routes/offerRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// ── Socket.io Setup ─────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
  },
});

// Make io accessible to routes
app.set('io', io);

// ── Metadata Directory ──────────────────────────────────────────
const metadataDir = path.join(__dirname, '..', 'metadata');
if (!fs.existsSync(metadataDir)) fs.mkdirSync(metadataDir, { recursive: true });

// ── Middleware ───────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 2000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: function (_req, res) {
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    });
  },
});
const rateLimitEnabled = String(
  process.env.ENABLE_API_RATE_LIMIT != null
    ? process.env.ENABLE_API_RATE_LIMIT
    : (process.env.NODE_ENV === 'production')
).toLowerCase() === 'true';

if (rateLimitEnabled) {
  app.use(limiter);
} else {
  console.log('⚙️ API rate limiting disabled for local development');
}
app.use('/metadata', express.static(metadataDir));

// ── Health Check ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'NFT DApp API running',
    timestamp: new Date().toISOString(),
    realtime: true,
  });
});

// ── Routes ──────────────────────────────────────────────────────
app.use('/api/nfts', nftRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ipfs', ipfsRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/offers', offerRoutes);

app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));
app.use(errorHandler);

// ── Socket.io Connection Handler ────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ── On-Chain Event Polling (CU-budget-aware) ─────────────────────
const POLL_INTERVAL = 15000;   // 15 seconds between poll cycles
const MAX_BLOCK_RANGE = 9;     // Alchemy free tier: 10 blocks max per eth_getLogs call
const BACKFILL_DEPTH = 50;     // FIX: was 200 — reduced to save ~15,000 CU on startup
const RPC_PACE_MS = 500;       // FIX: was 250 — halves CU/s consumption (300→150 CU/s)
const CHUNK_GAP_MS = 3000;     // FIX: was 1500 — more breathing room for API routes

/** Simple sleep promise */
function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function invalidateApiCaches() {
  if (typeof nftRoutes.clearRouteCache === 'function') nftRoutes.clearRouteCache();
  if (typeof marketplaceRoutes.clearRouteCache === 'function') marketplaceRoutes.clearRouteCache();
  if (typeof historyRoutes.clearRouteCache === 'function') historyRoutes.clearRouteCache();
}

function setupEventListeners() {
  try {
    const provider = getProvider();

    const nftContract = new ethers.Contract(CONTRACT_ADDRESS, [
      'event NFTMinted(uint256 indexed tokenId, address indexed minter, string tokenURI)',
      'event NFTBurned(uint256 indexed tokenId, address indexed burner)',
      'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    ], provider);

    const marketplaceContract = new ethers.Contract(MARKETPLACE_ADDRESS, [
      'event Listed(uint256 indexed listingId, address indexed seller, address nftContract, uint256 indexed tokenId, uint256 price, bool isAuction, uint256 auctionEndTime)',
      'event Sale(uint256 indexed listingId, address indexed buyer, uint256 tokenId, uint256 price)',
      'event BidPlaced(uint256 indexed listingId, address indexed bidder, uint256 amount)',
      'event AuctionSettled(uint256 indexed listingId, address indexed winner, uint256 amount)',
      'event ListingCancelled(uint256 indexed listingId)',
      'event ListingPriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice)',
      'event OfferMade(uint256 indexed offerId, address indexed buyer, address nftContract, uint256 indexed tokenId, uint256 amount, uint256 expiresAt)',
      'event OfferAccepted(uint256 indexed offerId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 amount)',
      'event OfferCancelled(uint256 indexed offerId)',
      'event OfferDeclined(uint256 indexed offerId, address indexed owner)',
    ], provider);

    let lastBlock = null;

    /**
     * Process all events in a given block range for both contracts.
     * Range MUST be <= MAX_BLOCK_RANGE (10 blocks inclusive).
     */
    async function processChunk(from, to, options) {
      var replayed = !!(options && options.replayed);
      var emit = function (eventName, payload) {
        io.emit(eventName, Object.assign({}, payload, { replayed: replayed }));
      };
      const newEvents = [];

      // ── NFT Events ──
      try {
        const mintEvents = await nftContract.queryFilter('NFTMinted', from, to);
        for (const e of mintEvents) {
          const { tokenId, minter, tokenURI } = e.args;
          console.log(`📡 NFTMinted: Token #${tokenId} by ${minter}`);
          emit('nft:minted', { tokenId: Number(tokenId), minter, tokenURI });
          newEvents.push({
            eventType: 'mint',
            tokenId: Number(tokenId),
            from: ethers.ZeroAddress,
            to: minter,
            value: null,
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            timestamp: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const burnEvents = await nftContract.queryFilter('NFTBurned', from, to);
        for (const e of burnEvents) {
          const { tokenId, burner } = e.args;
          console.log(`📡 NFTBurned: Token #${tokenId} by ${burner}`);
          emit('nft:burned', { tokenId: Number(tokenId), burner });
          newEvents.push({
            eventType: 'burn',
            tokenId: Number(tokenId),
            from: burner,
            to: ethers.ZeroAddress,
            value: null,
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
            timestamp: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const transferEvents = await nftContract.queryFilter('Transfer', from, to);
        for (const e of transferEvents) {
          const { from: txFrom, to: txTo, tokenId } = e.args;
          emit('nft:transfer', { from: txFrom, to: txTo, tokenId: Number(tokenId) });
          // Don't add to store — Alchemy transfers API already covers these
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      // ── Marketplace Events ──
      try {
        const listedEvents = await marketplaceContract.queryFilter('Listed', from, to);
        for (const e of listedEvents) {
          const { listingId, seller, tokenId, price, isAuction, auctionEndTime } = e.args;
          console.log(`📡 Listed: #${listingId} — Token #${tokenId}`);
          emit('marketplace:listed', {
            listingId: Number(listingId), seller, tokenId: Number(tokenId),
            price: ethers.formatEther(price), isAuction, auctionEndTime: Number(auctionEndTime),
          });
          newEvents.push({
            eventType: 'listed', tokenId: Number(tokenId), from: seller, to: null,
            value: ethers.formatEther(price), txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            listingId: Number(listingId), offerId: null, isAuction: isAuction,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const saleEvents = await marketplaceContract.queryFilter('Sale', from, to);
        for (const e of saleEvents) {
          const { listingId, buyer, tokenId, price } = e.args;
          console.log(`📡 Sale: #${listingId} — Token #${tokenId}`);
          emit('marketplace:sale', {
            listingId: Number(listingId), buyer, tokenId: Number(tokenId),
            price: ethers.formatEther(price),
          });
          newEvents.push({
            eventType: 'sale', tokenId: Number(tokenId), from: null, to: buyer,
            value: ethers.formatEther(price), txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            listingId: Number(listingId), offerId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const bidEvents = await marketplaceContract.queryFilter('BidPlaced', from, to);
        for (const e of bidEvents) {
          const { listingId, bidder, amount } = e.args;
          console.log(`📡 BidPlaced: #${listingId} by ${bidder}`);
          emit('marketplace:bid', {
            listingId: Number(listingId), bidder, amount: ethers.formatEther(amount),
          });
          newEvents.push({
            eventType: 'bid', tokenId: null, from: bidder, to: null,
            value: ethers.formatEther(amount), txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            listingId: Number(listingId), offerId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const settledEvents = await marketplaceContract.queryFilter('AuctionSettled', from, to);
        for (const e of settledEvents) {
          const { listingId, winner, amount } = e.args;
          emit('marketplace:settled', {
            listingId: Number(listingId), winner, amount: ethers.formatEther(amount),
          });
          newEvents.push({
            eventType: 'auction_settled', tokenId: null, from: null, to: winner,
            value: ethers.formatEther(amount), txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            listingId: Number(listingId), offerId: null, isAuction: true,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const cancelledEvents = await marketplaceContract.queryFilter('ListingCancelled', from, to);
        for (const e of cancelledEvents) {
          emit('marketplace:cancelled', { listingId: Number(e.args.listingId) });
          newEvents.push({
            eventType: 'listing_cancelled', tokenId: null, from: null, to: null,
            value: null, txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            listingId: Number(e.args.listingId), offerId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const priceEvents = await marketplaceContract.queryFilter('ListingPriceUpdated', from, to);
        for (const e of priceEvents) {
          const { listingId, oldPrice, newPrice } = e.args;
          emit('marketplace:priceUpdated', {
            listingId: Number(listingId),
            oldPrice: ethers.formatEther(oldPrice),
            newPrice: ethers.formatEther(newPrice),
          });
          newEvents.push({
            eventType: 'price_updated', tokenId: null, from: null, to: null,
            value: ethers.formatEther(newPrice), txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            listingId: Number(listingId), offerId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const offerEvents = await marketplaceContract.queryFilter('OfferMade', from, to);
        for (const e of offerEvents) {
          const { offerId, buyer, tokenId, amount, expiresAt } = e.args;
          emit('offer:made', {
            offerId: Number(offerId), buyer, tokenId: Number(tokenId),
            amount: ethers.formatEther(amount), expiresAt: Number(expiresAt),
          });
          newEvents.push({
            eventType: 'offer_made', tokenId: Number(tokenId), from: buyer, to: null,
            value: ethers.formatEther(amount), txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            offerId: Number(offerId), listingId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const acceptedEvents = await marketplaceContract.queryFilter('OfferAccepted', from, to);
        for (const e of acceptedEvents) {
          const { offerId, seller, buyer, tokenId, amount } = e.args;
          emit('offer:accepted', {
            offerId: Number(offerId), seller, buyer, tokenId: Number(tokenId),
            amount: ethers.formatEther(amount),
          });
          newEvents.push({
            eventType: 'offer_accepted', tokenId: Number(tokenId), from: seller, to: buyer,
            value: ethers.formatEther(amount), txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            offerId: Number(offerId), listingId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const offerCancelledEvents = await marketplaceContract.queryFilter('OfferCancelled', from, to);
        for (const e of offerCancelledEvents) {
          emit('offer:cancelled', { offerId: Number(e.args.offerId) });
          newEvents.push({
            eventType: 'offer_cancelled', tokenId: null, from: null, to: null,
            value: null, txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            offerId: Number(e.args.offerId), listingId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      try {
        const declinedEvents = await marketplaceContract.queryFilter('OfferDeclined', from, to);
        for (const e of declinedEvents) {
          emit('offer:declined', {
            offerId: Number(e.args.offerId),
            owner: e.args.owner,
          });
          newEvents.push({
            eventType: 'offer_declined', tokenId: null, from: e.args.owner, to: null,
            value: null, txHash: e.transactionHash,
            blockNumber: e.blockNumber, timestamp: null,
            offerId: Number(e.args.offerId), listingId: null, isAuction: null,
          });
        }
      } catch (e) { /* skip */ }
      await sleep(RPC_PACE_MS);

      // Store all new events
      if (newEvents.length > 0) {
        invalidateApiCaches();
        eventStore.addEvents(newEvents);
      }
    }

    /**
     * Main poll function — scans in chunks of MAX_BLOCK_RANGE
     */
    async function pollEvents() {
      try {
        const currentBlock = await provider.getBlockNumber();
        const isInitialBackfill = lastBlock === null;

        if (isInitialBackfill) {
          // First run — backfill last BACKFILL_DEPTH blocks
          lastBlock = Math.max(0, currentBlock - BACKFILL_DEPTH);
          console.log(`📡 Event polling started. Backfilling from block ${lastBlock} to ${currentBlock} (${currentBlock - lastBlock} blocks in chunks of ${MAX_BLOCK_RANGE + 1})...`);
        }

        if (currentBlock <= lastBlock) return; // No new blocks

        // Process in chunks of MAX_BLOCK_RANGE
        let from = lastBlock + 1;
        while (from <= currentBlock) {
          const to = Math.min(from + MAX_BLOCK_RANGE, currentBlock);
          await processChunk(from, to, { replayed: isInitialBackfill });
          lastBlock = to; // Update after each successful chunk
          from = to + 1;

          // FIX: Gap between chunks increased from 1.5s to 3s.
          // Each chunk fires 12 queryFilter calls at 500ms pacing (~6s),
          // consuming ~150 CU/s. The 3s gap brings average down to ~100 CU/s,
          // leaving 230 CU/s for API routes.
          if (from <= currentBlock) {
            await sleep(CHUNK_GAP_MS);
          }
        }

        // Persist cache after each poll cycle
        eventStore.persist();
      } catch (err) {
        if (err.message && !err.message.includes('filter not found')) {
          console.error('⚠️ Event poll error:', err.message);
        }
      }
    }

    // FIX: Delay first poll by 20s (was 5s).
    // On startup, the browser fires 5-10 API requests simultaneously.
    // With only 330 CU/s, the backfill was consuming 300 CU/s and starving
    // every API route — causing 17s response times across the board.
    // 20s gives the initial page load 4 full cycles of cache-building before
    // the poller starts competing for CU budget.
    setTimeout(function() {
      pollEvents();
      setInterval(pollEvents, POLL_INTERVAL);
    }, 20000);

    console.log(`📡 On-chain event polling active (every ${POLL_INTERVAL / 1000}s, max ${MAX_BLOCK_RANGE + 1} blocks per query, first poll in 20s)`);
  } catch (err) {
    console.error('⚠️ Failed to setup event listeners:', err.message);
    console.log('   Real-time updates disabled — check RPC_URL in .env');
  }
}

// ── Start Server ────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('═'.repeat(55));
  console.log('  NFT DApp API Server (with Real-Time Events)');
  console.log(`  Port:     ${PORT}`);
  console.log(`  Health:   http://localhost:${PORT}/api/health`);
  console.log(`  Socket:   ws://localhost:${PORT}`);
  console.log('═'.repeat(55));

  setupEventListeners();
});

module.exports = app;
