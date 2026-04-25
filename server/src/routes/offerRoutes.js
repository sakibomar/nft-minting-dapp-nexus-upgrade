/**
 * @file offerRoutes.js
 * @description API routes for the Make Offer system.
 */

const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { callOptional, getMarketplaceContract, getContract, CONTRACT_ADDRESS, isMissingMethodError, isRateLimitError } = require('../config/contract');
const eventStore = require('../cache/eventStore');
const { resolveTokenMetadata } = require('../utils/ipfs');

function isRecoverableOfferError(err) {
  var msg = String((err && err.message) || '').toLowerCase();
  return !!(
    isMissingMethodError(err) ||
    isRateLimitError(err) ||
    (err && (
      err.code === 'CALL_EXCEPTION' ||
      msg.indexOf('missing revert data') !== -1 ||
      msg.indexOf('nonexistent token') !== -1 ||
      msg.indexOf('erc721nonexistenttoken') !== -1
    ))
  );
}

function toWeiString(value) {
  try {
    return ethers.parseEther(String(value || '0')).toString();
  } catch (_err) {
    return '0';
  }
}

/**
 * Format a raw offer struct from the contract.
 */
function formatOffer(offer) {
  return {
    offerId: Number(offer.offerId),
    buyer: offer.buyer,
    nftContract: offer.nftContract,
    tokenId: Number(offer.tokenId),
    amount: ethers.formatEther(offer.amount),
    amountWei: offer.amount.toString(),
    expiresAt: Number(offer.expiresAt),
    active: offer.active,
  };
}

function getOffersFromEventStore(filters) {
  var events = eventStore.getAllEvents().slice().sort(function (a, b) {
    return (a.blockNumber || 0) - (b.blockNumber || 0);
  });
  var offers = new Map();

  for (var i = 0; i < events.length; i++) {
    var evt = events[i];
    var offerId = Number(evt.offerId);
    if (!Number.isFinite(offerId)) continue;

    if (evt.eventType === 'offer_made') {
      var amount = String(evt.value || '0');
      offers.set(offerId, {
        offerId: offerId,
        buyer: evt.from || ethers.ZeroAddress,
        nftContract: CONTRACT_ADDRESS,
        tokenId: Number(evt.tokenId),
        amount: amount,
        amountWei: toWeiString(amount),
        expiresAt: Number(evt.expiresAt || 0),
        active: true,
      });
      continue;
    }

    if (
      (evt.eventType === 'offer_accepted' || evt.eventType === 'offer_cancelled' || evt.eventType === 'offer_declined') &&
      offers.has(offerId)
    ) {
      var next = offers.get(offerId);
      next.active = false;
      offers.set(offerId, next);
    }
  }

  var result = Array.from(offers.values()).sort(function (a, b) {
    return b.offerId - a.offerId;
  });

  if (filters && filters.tokenId != null) {
    result = result.filter(function (offer) { return Number(offer.tokenId) === Number(filters.tokenId); });
  }

  if (filters && filters.offerId != null) {
    result = result.filter(function (offer) { return Number(offer.offerId) === Number(filters.offerId); });
  }

  if (filters && filters.buyer) {
    var buyer = String(filters.buyer).toLowerCase();
    result = result.filter(function (offer) {
      return offer.buyer && offer.buyer.toLowerCase() === buyer;
    });
  }

  if (filters && filters.activeOnly) {
    result = result.filter(function (offer) { return offer.active; });
  }

  return result;
}

/**
 * GET /api/offers/token/:tokenId
 * Returns all active offers for a specific token.
 */
router.get('/token/:tokenId', async (req, res, next) => {
  try {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (isNaN(tokenId) || tokenId < 0) {
      return res.status(400).json({ success: false, error: 'Invalid token ID' });
    }

    const marketplace = getMarketplaceContract();
    const rawOffers = await callOptional(marketplace, 'getOffersForToken', [CONTRACT_ADDRESS, tokenId], null);
    const offers = Array.isArray(rawOffers)
      ? rawOffers.map(formatOffer)
      : getOffersFromEventStore({ tokenId: tokenId, activeOnly: true });

    res.json({ success: true, tokenId, count: offers.length, offers, stale: !Array.isArray(rawOffers) });
  } catch (err) {
    if (isRecoverableOfferError(err)) {
      console.warn(`⚠️ GET /api/offers/token/${req.params.tokenId} degraded: ${err.message}`);
      var fallbackOffers = getOffersFromEventStore({
        tokenId: parseInt(req.params.tokenId, 10),
        activeOnly: true,
      });
      return res.json({
        success: true,
        tokenId: parseInt(req.params.tokenId, 10),
        count: fallbackOffers.length,
        offers: fallbackOffers,
        stale: true,
      });
    }
    next(err);
  }
});

/**
 * GET /api/offers/buyer/:address
 * Returns all active offers made by a specific buyer.
 */
router.get('/buyer/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ success: false, error: 'Invalid Ethereum address' });
    }

    const marketplace = getMarketplaceContract();
    const rawOffers = await callOptional(marketplace, 'getOffersByBuyer', [address], null);
    const offers = Array.isArray(rawOffers)
      ? rawOffers.map(formatOffer)
      : getOffersFromEventStore({ buyer: address, activeOnly: true });

    res.json({ success: true, buyer: address, count: offers.length, offers, stale: !Array.isArray(rawOffers) });
  } catch (err) {
    if (isRecoverableOfferError(err)) {
      console.warn(`⚠️ GET /api/offers/buyer/${req.params.address} degraded: ${err.message}`);
      const offers = getOffersFromEventStore({ buyer: req.params.address, activeOnly: true });
      return res.json({
        success: true,
        buyer: req.params.address,
        count: offers.length,
        offers,
        stale: true,
      });
    }
    next(err);
  }
});

/**
 * GET /api/offers/:offerId
 * Returns details of a specific offer.
 */
router.get('/:offerId', async (req, res, next) => {
  try {
    const offerId = parseInt(req.params.offerId, 10);
    if (isNaN(offerId) || offerId < 0) {
      return res.status(400).json({ success: false, error: 'Invalid offer ID' });
    }

    const marketplace = getMarketplaceContract();
    let raw = null;
    try {
      raw = await marketplace.getOffer(offerId);
    } catch (err) {
      if (!isRecoverableOfferError(err)) {
        throw err;
      }
    }

    const offer = raw
      ? formatOffer(raw)
      : getOffersFromEventStore({ offerId: offerId })[0];

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    // Enrich with NFT metadata
    const nftContract = getContract();
    try {
      const tokenURI = await nftContract.tokenURI(offer.tokenId);
      const metadata = await resolveTokenMetadata(tokenURI);
      offer.name = metadata.name;
      offer.image = metadata.image;
      offer.imageUrl = metadata.imageUrl;
    } catch {
      offer.name = `NFT #${offer.tokenId}`;
      offer.image = '';
      offer.imageUrl = '';
    }

    res.json({ success: true, offer, stale: !raw });
  } catch (err) {
    if (isRecoverableOfferError(err)) {
      const offer = getOffersFromEventStore({ offerId: parseInt(req.params.offerId, 10) })[0];
      if (offer) {
        return res.json({ success: true, offer, stale: true });
      }
    }
    next(err);
  }
});

/**
 * GET /api/offers
 * Returns total offers count.
 */
router.get('/', async (_req, res, next) => {
  try {
    const marketplace = getMarketplaceContract();
    const totalValue = await callOptional(marketplace, 'getTotalOffers', [], null);
    const total = totalValue != null ? Number(totalValue) : getOffersFromEventStore().length;

    res.json({ success: true, totalOffers: total, stale: totalValue == null });
  } catch (err) {
    if (isRecoverableOfferError(err)) {
      return res.json({
        success: true,
        totalOffers: getOffersFromEventStore().length,
        stale: true,
      });
    }
    next(err);
  }
});

module.exports = router;
