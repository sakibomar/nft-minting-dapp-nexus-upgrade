/**
 * @file useMarketplace.js
 * @description Custom hook for NFTMarketplace contract interactions.
 *              Includes fixed-price, auctions, offers, and edit listing.
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI, CONTRACT_ADDRESS } from '../utils/constants';
import { fetchApi, fetchApiJson } from '../utils/api';

export default function useMarketplace(account) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearMarketplaceCaches = useCallback(async ({ clearNfts = false } = {}) => {
    const requests = [
      fetchApi('/api/marketplace/cache/clear', { method: 'POST' }, { expectJson: true }),
      fetchApi('/api/history/cache/clear', { method: 'POST' }, { expectJson: true }),
    ];

    if (clearNfts) {
      requests.push(fetchApi('/api/nfts/cache/clear', { method: 'POST' }, { expectJson: true }));
    }

    const results = await Promise.allSettled(requests);
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.warn('Failed to clear backend cache:', result.reason);
      }
    });
  }, []);

  async function getMarketplace(needsSigner = false) {
    if (!window.ethereum) throw new Error('MetaMask not found');
    const provider = new ethers.BrowserProvider(window.ethereum);
    if (needsSigner) {
      const signer = await provider.getSigner();
      return new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
    }
    return new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);
  }

  // ── Listings ──────────────────────────────────────────────────

  // FIX: Wrap contract calls with Promise.resolve() so that if ethers.js v6
  //      returns a non-thenable (edge case with nonpayable + uint256 outputs),
  //      `await` won't crash with "Cannot read properties of undefined (reading 'then')".
  //      Also explicitly convert uint256 args to BigInt for type safety.

  const createListing = useCallback(async (tokenId, priceInEth) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const priceWei = ethers.parseEther(priceInEth.toString());
      const tx = await Promise.resolve(
        mp.createListing(CONTRACT_ADDRESS, BigInt(tokenId), priceWei)
      );
      const receipt = tx && typeof tx.wait === 'function' ? await tx.wait() : null;
      await clearMarketplaceCaches({ clearNfts: true });
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const createAuction = useCallback(async (tokenId, startPriceEth, reservePriceEth, durationSec) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const startWei = ethers.parseEther(startPriceEth.toString());
      const reserveWei = ethers.parseEther(reservePriceEth.toString());
      const duration = BigInt(Math.floor(Number(durationSec)));
      const tx = await Promise.resolve(
        mp.createAuction(CONTRACT_ADDRESS, BigInt(tokenId), startWei, reserveWei, duration)
      );
      const receipt = tx && typeof tx.wait === 'function' ? await tx.wait() : null;
      await clearMarketplaceCaches({ clearNfts: true });
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const buyNow = useCallback(async (listingId, priceEth) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      // Convert ETH string (e.g. "0.001") to wei BigInt for ethers v6
      const valueWei = ethers.parseEther(priceEth.toString());
      const tx = await mp.buyNow(listingId, { value: valueWei });
      const receipt = await tx.wait();
      await clearMarketplaceCaches({ clearNfts: true });
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const placeBid = useCallback(async (listingId, bidAmountEth) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const tx = await mp.placeBid(listingId, { value: ethers.parseEther(bidAmountEth.toString()) });
      const receipt = await tx.wait();
      await clearMarketplaceCaches();
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const settleAuction = useCallback(async (listingId) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const tx = await mp.settleAuction(listingId);
      const receipt = await tx.wait();
      await clearMarketplaceCaches({ clearNfts: true });
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const cancelListing = useCallback(async (listingId) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const tx = await mp.cancelListing(listingId);
      const receipt = await tx.wait();
      await clearMarketplaceCaches({ clearNfts: true });
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const updateListingPrice = useCallback(async (listingId, newPriceEth) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const priceWei = ethers.parseEther(newPriceEth.toString());
      const tx = await mp.updateListingPrice(listingId, priceWei);
      const receipt = await tx.wait();
      await clearMarketplaceCaches();
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  // ── Offers ────────────────────────────────────────────────────

  const makeOffer = useCallback(async (tokenId, amountEth, durationHours) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const expiresAt = Math.floor(Date.now() / 1000) + (durationHours * 3600);
      const tx = await mp.makeOffer(CONTRACT_ADDRESS, tokenId, expiresAt, {
        value: ethers.parseEther(amountEth.toString()),
      });
      const receipt = await tx.wait();
      await clearMarketplaceCaches();
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const acceptOffer = useCallback(async (offerId) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const tx = await mp.acceptOffer(offerId);
      const receipt = await tx.wait();
      await clearMarketplaceCaches({ clearNfts: true });
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const cancelOffer = useCallback(async (offerId) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const tx = await mp.cancelOffer(offerId);
      const receipt = await tx.wait();
      await clearMarketplaceCaches();
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  // ── API Fetchers ──────────────────────────────────────────────

  const getActiveListings = useCallback(async (options = {}) => {
    const force = options.force === true;
    try {
      const { data } = await fetchApiJson(`/api/marketplace/listings/active${force ? '?force=1' : ''}`);
      return data.success ? data.listings : [];
    } catch {
      return [];
    }
  }, []);

  const getAllListings = useCallback(async (options = {}) => {
    const force = options.force === true;
    try {
      const { data } = await fetchApiJson(`/api/marketplace/listings${force ? '?force=1' : ''}`);
      return data.success ? data.listings : [];
    } catch {
      return [];
    }
  }, []);

  const getListingById = useCallback(async (listingId) => {
    try {
      const { data } = await fetchApiJson(`/api/marketplace/listings/${listingId}`);
      return data.success ? data.listing : null;
    } catch {
      return null;
    }
  }, []);

  const getOffersForToken = useCallback(async (tokenId) => {
    try {
      const { data } = await fetchApiJson(`/api/offers/token/${tokenId}`);
      return data.success ? data.offers : [];
    } catch {
      return [];
    }
  }, []);

  const getOffersByBuyer = useCallback(async (address) => {
    try {
      const { data } = await fetchApiJson(`/api/offers/buyer/${address}`);
      return data.success ? data.offers : [];
    } catch {
      return [];
    }
  }, []);

  // Admin
  const declineOffer = useCallback(async (offerId) => {
    setLoading(true);
    setError(null);
    try {
      const mp = await getMarketplace(true);
      const tx = await mp.declineOffer(offerId);
      const receipt = await tx.wait();
      await clearMarketplaceCaches();
      return { tx, receipt };
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearMarketplaceCaches]);

  const pauseMarketplace = useCallback(async () => {
    const mp = await getMarketplace(true);
    const tx = await mp.pause();
    return tx.wait();
  }, [account]);

  const unpauseMarketplace = useCallback(async () => {
    const mp = await getMarketplace(true);
    const tx = await mp.unpause();
    return tx.wait();
  }, [account]);

  const isPaused = useCallback(async () => {
    try {
      const mp = await getMarketplace(false);
      return await mp.paused();
    } catch {
      return false;
    }
  }, []);

  return {
    loading, error,
    createListing, createAuction, buyNow, placeBid,
    settleAuction, cancelListing, updateListingPrice,
    makeOffer, acceptOffer, cancelOffer, declineOffer,
    getActiveListings, getAllListings, getListingById,
    getOffersForToken, getOffersByBuyer,
    pauseMarketplace, unpauseMarketplace, isPaused,
  };
}
