import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { shortenAddress, formatEth, formatTimeRemaining, resolveIpfsUrl } from '../utils/helpers';

const ListingCard = ({ listing, account, onBuy, onBid, onCancel, onSettle }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [timeRemaining, setTimeRemaining] = useState('');
  const [auctionEnded, setAuctionEnded] = useState(false);

  const resolveImageUrl = useCallback(() => {
    return resolveIpfsUrl(listing.imageUrl || listing.image);
  }, [listing.image, listing.imageUrl]);

  const imageUrl = resolveImageUrl();
  const isSeller = account && listing.seller && account.toLowerCase() === listing.seller.toLowerCase();

  // Update time remaining for auctions
  useEffect(() => {
    if (!listing.isAuction || !listing.auctionEndTime) return;

    const updateTimer = () => {
      const endTime = Number(listing.auctionEndTime) * 1000;
      const now = Date.now();
      if (now >= endTime) {
        setAuctionEnded(true);
        setTimeRemaining('Ended');
      } else {
        setAuctionEnded(false);
        setTimeRemaining(formatTimeRemaining(listing.auctionEndTime));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [listing.isAuction, listing.auctionEndTime]);

  const handleBuy = () => {
    if (onBuy) onBuy(listing.listingId, listing.price);
  };

  // ─── Minimum bid calculation ────────────────────────────────────────
  // Contract rule: first bid >= startPrice, subsequent bids > highestBid
  const hasBids = parseFloat(listing.highestBid) > 0;
  const minBidNum = useMemo(() => {
    if (hasBids) {
      // Must be strictly greater than current highest bid
      // Add a tiny increment so the user knows they must beat it
      const current = parseFloat(listing.highestBid);
      return current; // We'll check strictly-greater in validation
    }
    // First bid: must be >= startPrice
    return parseFloat(listing.startPrice || listing.price) || 0;
  }, [hasBids, listing.highestBid, listing.startPrice, listing.price]);

  const minBidDisplay = minBidNum > 0 ? minBidNum : 0.001;

  const handleBid = () => {
    const amount = parseFloat(bidAmount);
    if (!bidAmount || amount <= 0) return;

    // ── Client-side minimum bid validation with helpful toast ──
    if (hasBids) {
      if (amount <= minBidNum) {
        toast.error(
          `Bid must be greater than the current bid of ${minBidNum} ETH`,
          { icon: '💰' }
        );
        return;
      }
    } else {
      if (amount < minBidNum) {
        toast.error(
          `Bid must be at least ${minBidNum} ETH (the starting price)`,
          { icon: '💰' }
        );
        return;
      }
    }

    if (onBid) onBid(listing.listingId, bidAmount);
    setBidAmount('');
  };

  const handleCancel = () => {
    if (onCancel) onCancel(listing.listingId);
  };

  const handleSettle = () => {
    if (onSettle) onSettle(listing.listingId);
  };

  return (
    <div className="group relative rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] transition-all duration-300">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-[#141428]">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-purple-500/10 to-pink-500/10" />
        )}

        {imageError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#141428] text-white/30">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Image unavailable</span>
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={listing.name || `Token #${listing.tokenId}`}
            className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-110 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
        )}

        {/* Type Badge */}
        <div className={`absolute top-3 left-3 rounded-lg px-2.5 py-1 text-xs font-bold backdrop-blur-sm border ${
          listing.isAuction
            ? 'bg-orange-500/80 border-orange-400/30 text-white'
            : 'bg-emerald-500/80 border-emerald-400/30 text-white'
        }`}>
          {listing.isAuction ? '⏱ Auction' : '💰 Fixed Price'}
        </div>

        {/* Seller Badge */}
        {isSeller && (
          <div className="absolute top-3 right-3 bg-purple-500/80 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs font-bold text-white border border-purple-400/30">
            Your Listing
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        {/* Name and Token ID */}
        <div>
          <Link
            to={`/nft/${listing.tokenId}`}
            className="text-white font-bold text-lg truncate block hover:text-purple-300 transition-colors"
          >
            {listing.name || `NFT #${listing.tokenId}`}
          </Link>
          <span className="text-white/30 text-xs">Token #{listing.tokenId}</span>
        </div>

        {/* Seller */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-white/40">Seller</span>
          <Link
            to={`/profile/${listing.seller}`}
            className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
          >
            {shortenAddress(listing.seller)}
          </Link>
        </div>

        {/* Fixed Price */}
        {!listing.isAuction && (
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{formatEth(listing.price)}</span>
              <span className="text-white/40 text-sm">ETH</span>
            </div>
            {!isSeller && (
              <button
                onClick={handleBuy}
                disabled={isSeller}
                className="w-full py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Buy Now
              </button>
            )}
          </div>
        )}

        {/* Auction */}
        {listing.isAuction && (
          <div className="space-y-3">
            {/* Current bid / starting price */}
            {/* FIX: ethers.formatEther(0n) returns '0.0' not '0', so string
                 comparison '0.0' !== '0' was always true — use parseFloat > 0 instead */}
            <div>
              <span className="text-white/40 text-xs block mb-0.5">
                {parseFloat(listing.highestBid) > 0 ? 'Current Bid' : 'Starting Price'}
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">
                  {formatEth(parseFloat(listing.highestBid) > 0 ? listing.highestBid : (listing.startPrice || listing.price))}
                </span>
                <span className="text-white/40 text-sm">ETH</span>
              </div>
            </div>

            {/* Highest bidder */}
            {listing.highestBidder && listing.highestBidder !== ethers.ZeroAddress && (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-white/40">Highest Bidder</span>
                <span className="text-pink-400 font-medium">{shortenAddress(listing.highestBidder)}</span>
              </div>
            )}

            {/* Timer */}
            <div className={`flex items-center gap-2 text-sm font-semibold ${auctionEnded ? 'text-red-400' : 'text-orange-400'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {timeRemaining}
            </div>

            {/* Bid or Settle */}
            {auctionEnded ? (
              <button
                onClick={handleSettle}
                className="w-full py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg"
              >
                Settle Auction
              </button>
            ) : (
              !isSeller && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min={minBidDisplay}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={hasBids ? `> ${minBidNum} ETH` : `Min ${minBidDisplay} ETH`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-all"
                  />
                  <button
                    onClick={handleBid}
                    disabled={!bidAmount || parseFloat(bidAmount) <= 0}
                    className="px-4 py-2.5 rounded-xl font-semibold transition-all bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Place Bid
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Cancel button for seller */}
        {isSeller && (
          <button
            onClick={handleCancel}
            className="w-full py-2.5 rounded-xl font-semibold transition-all bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-sm"
          >
            Cancel Listing
          </button>
        )}
      </div>
    </div>
  );
};

export default ListingCard;
