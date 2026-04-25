/**
 * @file Marketplace.jsx
 * @description NFT Marketplace page — browse active listings, buy, bid, cancel, settle.
 *
 * FIX APPLIED:
 *   Added decodeContractError() helper that maps custom error names from the
 *   marketplace contract to human-readable toast messages. Previously, reverts
 *   showed "unknown custom error" because the ABI lacked error definitions
 *   (now fixed in constants.js) AND the catch blocks didn't extract the
 *   decoded error name from the ethers error object.
 *
 *   Also added auto-refresh after cancel/settle to prevent stale-data issues
 *   where a cancelled listing still appeared on screen.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import ListingCard from './ListingCard';
import { ETHERSCAN_BASE } from '../utils/constants';
import { fetchApiJson } from '../utils/api';

// ─── Custom Error Decoder ─────────────────────────────────────────────
// Maps Solidity custom error names → user-friendly messages.
// These names match the error definitions in NFTMarketplace.sol.
const MARKETPLACE_ERROR_MESSAGES = {
  ListingNotActive:    'This listing is no longer active. It may have been sold or cancelled.',
  NotSeller:           'Only the seller can perform this action.',
  NotTokenOwner:       'You do not own this token.',
  PriceCannotBeZero:   'Price must be greater than zero.',
  CannotBuyOwnListing: 'You cannot buy your own listing.',
  InsufficientPayment: 'Insufficient ETH sent for this purchase.',
  NotAuction:          'This listing is not an auction.',
  AuctionEnded:        'This auction has already ended.',
  AuctionNotEnded:     'This auction has not ended yet.',
  BidTooLow:           'Your bid is too low.',
  AuctionHasBids:      'Cannot cancel an auction that has bids.',
  InvalidDuration:     'Auction duration must be between 1 hour and 30 days.',
  ReserveNotMet:       'The reserve price was not met.',
  InvalidListingType:  'Wrong listing type for this operation.',
  OfferTooLow:         'Offer amount must be greater than zero.',
  OfferNotActive:      'This offer is no longer active.',
  NotOfferMaker:       'Only the offer maker can cancel this offer.',
  NotNFTOwner:         'Only the NFT owner can accept this offer.',
  OfferExpired:        'This offer has expired.',
  InvalidExpiration:   'Expiration must be in the future.',
};

/**
 * Extract a human-readable message from an ethers contract error.
 * Checks err.revert?.name (ethers v6 decoded custom error) first,
 * then falls back to err.reason, err.shortMessage, and err.message.
 */
function decodeContractError(err) {
  // ethers v6: decoded custom error name
  const errorName = err?.revert?.name || err?.errorName;
  if (errorName && MARKETPLACE_ERROR_MESSAGES[errorName]) {
    return MARKETPLACE_ERROR_MESSAGES[errorName];
  }

  // ethers v6: data-level error with selector (fallback parse)
  if (err?.data) {
    const selector = typeof err.data === 'string' ? err.data.slice(0, 10) : null;
    if (selector) {
      // Try to match selector to known errors by computing them
      for (const name of Object.keys(MARKETPLACE_ERROR_MESSAGES)) {
        const sig = ethers.id(`${name}()`).slice(0, 10);
        if (sig === selector) {
          return MARKETPLACE_ERROR_MESSAGES[name];
        }
      }
    }
  }

  // Standard ethers error fields
  if (err?.reason) return err.reason;
  if (err?.shortMessage) return err.shortMessage;

  // User rejected tx
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) {
    return 'Transaction was rejected in your wallet.';
  }

  return err?.message || 'Transaction failed. Please try again.';
}

const SkeletonListingCard = () => (
  <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 animate-pulse">
    <div className="aspect-square bg-white/5" />
    <div className="p-4 space-y-3">
      <div className="h-5 bg-white/10 rounded-lg w-3/4" />
      <div className="h-4 bg-white/5 rounded-lg w-1/2" />
      <div className="h-8 bg-white/5 rounded-lg w-full" />
      <div className="h-10 bg-white/10 rounded-xl w-full" />
    </div>
  </div>
);

const Marketplace = ({ account, contract, marketplace, refreshKey, forceNonce }) => {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [collectionStats, setCollectionStats] = useState({
    items: 0, owners: 0, floorPrice: null, volume: '0',
  });

  const fetchListings = useCallback(async ({ force = false } = {}) => {
    if (!marketplace || !marketplace.getActiveListings) return;
    setLoading(true);
    setError(null);
    try {
      const activeListings = await marketplace.getActiveListings({ force });
      const nftQuerySuffix = force ? '?force=1' : '';

      // Enrich listings with NFT metadata
      const enrichedListings = await Promise.all(
        activeListings.map(async (listing) => {
          try {
            const { res, data } = await fetchApiJson(`/api/nfts/${listing.tokenId}${nftQuerySuffix}`);
            if (!res.ok) {
              return listing;
            }

            if (data?.success && data.nft) {
              return {
                ...listing,
                name: data.nft.name || listing.name,
                image: data.nft.image || listing.image,
                imageUrl: data.nft.imageUrl || listing.imageUrl,
              };
            }
          } catch (err) {
            console.warn('Failed to fetch metadata for token', listing.tokenId, err);
          }
          return listing;
        })
      );

      setListings(enrichedListings);
    } catch (err) {
      console.error('Error fetching listings:', err);
      setError('Failed to load marketplace listings');
    } finally {
      setLoading(false);
    }
  }, [marketplace]);

  useEffect(() => {
    fetchListings({ force: false });
  }, [fetchListings, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) {
      fetchListings({ force: true });
    }
  }, [fetchListings, forceNonce]);

  // ─── Collection Stats (items, owners, floor, volume) ─────────────────
  const fetchCollectionStats = useCallback(async ({ force = false } = {}) => {
    try {
      const stats = await contract?.getContractStats?.({ force });
      if (!stats) {
        return;
      }

      const activeListings = listings.filter((l) => l.active !== false);
      const listingFloor = activeListings
        .map((l) => parseFloat(l.price || '0'))
        .filter((price) => Number.isFinite(price) && price > 0)
        .sort((a, b) => a - b)[0];

      setCollectionStats({
        items: Number(stats.totalSupply ?? stats.totalMinted ?? 0),
        owners: Number(stats.totalOwners ?? 0),
        floorPrice: stats.floorPrice != null ? Number(stats.floorPrice) : (listingFloor ?? null),
        volume: stats.totalVolume || '0',
      });
    } catch (err) {
      console.warn('Collection stats fetch failed:', err);
    }
  }, [contract, listings]);

  useEffect(() => {
    fetchCollectionStats({ force: false });
  }, [fetchCollectionStats, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) {
      fetchCollectionStats({ force: true });
    }
  }, [fetchCollectionStats, forceNonce]);

  const filteredAndSortedListings = useMemo(() => {
    let result = [...listings];

    // Filter by tab
    if (filterTab === 'fixed') {
      result = result.filter((l) => !l.isAuction);
    } else if (filterTab === 'auctions') {
      result = result.filter((l) => l.isAuction);
    }

    // Sort
    switch (sortBy) {
      case 'price_low':
        result.sort((a, b) => {
          const priceA = parseFloat(a.price || '0');
          const priceB = parseFloat(b.price || '0');
          return priceA - priceB;
        });
        break;
      case 'price_high':
        result.sort((a, b) => {
          const priceA = parseFloat(a.price || '0');
          const priceB = parseFloat(b.price || '0');
          return priceB - priceA;
        });
        break;
      case 'newest':
        result.sort((a, b) => Number(b.listingId) - Number(a.listingId));
        break;
      case 'ending_soon':
        result.sort((a, b) => {
          const endA = a.isAuction ? Number(a.auctionEndTime || 0) : Infinity;
          const endB = b.isAuction ? Number(b.auctionEndTime || 0) : Infinity;
          return endA - endB;
        });
        break;
      default:
        break;
    }

    return result;
  }, [listings, filterTab, sortBy]);

  const handleBuy = async (listingId, price) => {
    if (!marketplace || !marketplace.buyNow) return;
    try {
      // `price` already comes in as ETH (string) from the listing API/UI.
      // `useMarketplace.buyNow()` converts ETH -> wei internally.
      const result = await marketplace.buyNow(listingId, price);
      toast.success(
        <div>
          <p className="font-semibold">Purchase Successful! 🎉</p>
          <a
            href={`${ETHERSCAN_BASE}/tx/${result.tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline text-sm"
          >
            View on Etherscan
          </a>
        </div>,
        { duration: 6000 }
      );
      await fetchListings({ force: true });
      // Force UI refresh on other pages too (e.g., Gallery / My NFTs)
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Buy error:', err);
      const msg = decodeContractError(err);
      toast.error(msg);
      // Auto-refresh if the listing is stale (already sold/cancelled)
      if (msg.includes('no longer active')) {
        fetchListings({ force: true });
      }
    }
  };

  const handleBid = async (listingId, bidAmountEth) => {
    if (!marketplace || !marketplace.placeBid) return;
    try {
      const result = await marketplace.placeBid(listingId, bidAmountEth);
      toast.success(
        <div>
          <p className="font-semibold">Bid Placed! 🎯</p>
          <a
            href={`${ETHERSCAN_BASE}/tx/${result.tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline text-sm"
          >
            View on Etherscan
          </a>
        </div>,
        { duration: 6000 }
      );
      fetchListings({ force: true });
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Bid error:', err);
      toast.error(decodeContractError(err));
    }
  };

  const handleCancel = async (listingId) => {
    if (!marketplace || !marketplace.cancelListing) return;
    try {
      const tx = await marketplace.cancelListing(listingId);
      toast.success('Listing cancelled successfully');
      fetchListings({ force: true });
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Cancel error:', err);
      toast.error(decodeContractError(err));
      // Refresh listings even on failure — listing state may have changed
      fetchListings({ force: true });
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    }
  };

  const handleSettle = async (listingId) => {
    if (!marketplace || !marketplace.settleAuction) return;
    try {
      const result = await marketplace.settleAuction(listingId);
      toast.success(
        <div>
          <p className="font-semibold">Auction Settled! 🏆</p>
          <a
            href={`${ETHERSCAN_BASE}/tx/${result.tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline text-sm"
          >
            View on Etherscan
          </a>
        </div>,
        { duration: 6000 }
      );
      fetchListings({ force: true });
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Settle error:', err);
      toast.error(decodeContractError(err));
      fetchListings({ force: true });
    }
  };

  const activeListingCount = listings.filter((l) => l.active !== false).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">NFT Marketplace</h1>
          <p className="text-white/50 mt-1">
            {loading
              ? 'Loading listings...'
              : `${activeListingCount} active listing${activeListingCount !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={fetchListings}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ─── Collection Stats Bar ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Items',
            value: collectionStats.items,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            ),
            gradient: 'from-purple-500/20 to-purple-600/5',
            border: 'border-purple-500/20',
            iconBg: 'bg-purple-500/10 text-purple-400',
          },
          {
            label: 'Unique Owners',
            value: collectionStats.owners,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
            gradient: 'from-blue-500/20 to-blue-600/5',
            border: 'border-blue-500/20',
            iconBg: 'bg-blue-500/10 text-blue-400',
          },
          {
            label: 'Floor Price',
            value: collectionStats.floorPrice !== null
              ? `${collectionStats.floorPrice < 0.0001 ? '<0.0001' : collectionStats.floorPrice.toFixed(4)} ETH`
              : '—',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
            gradient: 'from-emerald-500/20 to-emerald-600/5',
            border: 'border-emerald-500/20',
            iconBg: 'bg-emerald-500/10 text-emerald-400',
          },
          {
            label: 'Total Volume',
            value: `${parseFloat(collectionStats.volume) < 0.0001 && parseFloat(collectionStats.volume) > 0
              ? '<0.0001'
              : parseFloat(collectionStats.volume).toFixed(4)} ETH`,
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            ),
            gradient: 'from-pink-500/20 to-pink-600/5',
            border: 'border-pink-500/20',
            iconBg: 'bg-pink-500/10 text-pink-400',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`backdrop-blur-xl bg-gradient-to-br ${stat.gradient} border ${stat.border} rounded-2xl p-4 transition-all hover:scale-[1.02] hover:shadow-lg`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                {stat.icon}
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {stat.value}
            </div>
            <div className="text-[11px] text-white/40 mt-1 uppercase tracking-wider font-medium">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Sort */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          {/* Filter Tabs */}
          <div className="flex bg-white/5 rounded-xl border border-white/10 p-1">
            {[
              { key: 'all', label: 'All Listings' },
              { key: 'fixed', label: 'Fixed Price' },
              { key: 'auctions', label: 'Auctions' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  filterTab === tab.key
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all appearance-none cursor-pointer"
          >
            <option value="newest" className="bg-[#141428]">Newest First</option>
            <option value="price_low" className="bg-[#141428]">Price: Low → High</option>
            <option value="price_high" className="bg-[#141428]">Price: High → Low</option>
            <option value="ending_soon" className="bg-[#141428]">Ending Soon</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonListingCard key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-white/50 mb-4">{error}</p>
          <button
            onClick={fetchListings}
            className="px-6 py-3 rounded-xl font-semibold transition-all bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredAndSortedListings.length === 0 && (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-purple-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-xl mb-2">No Active Listings</h3>
          <p className="text-white/40 mb-6">
            {filterTab !== 'all'
              ? `No ${filterTab === 'fixed' ? 'fixed price' : 'auction'} listings found. Try viewing all listings.`
              : 'The marketplace is empty. List your NFT to get started!'}
          </p>
          {filterTab !== 'all' && (
            <button
              onClick={() => setFilterTab('all')}
              className="px-6 py-3 rounded-xl font-semibold transition-all bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30"
            >
              View All Listings
            </button>
          )}
        </div>
      )}

      {/* Listings Grid */}
      {!loading && !error && filteredAndSortedListings.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedListings.map((listing) => (
            <ListingCard
              key={listing.listingId}
              listing={listing}
              account={account}
              onBuy={handleBuy}
              onBid={handleBid}
              onCancel={handleCancel}
              onSettle={handleSettle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Marketplace;
