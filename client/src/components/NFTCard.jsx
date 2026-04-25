import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { shortenAddress, resolveIpfsUrl } from '../utils/helpers';

const NFTCard = ({ nft, account, listing, isFavorite, onToggleFavorite, showActions }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const resolveImageUrl = useCallback(() => {
    return resolveIpfsUrl(nft.imageUrl || nft.image);
  }, [nft.image, nft.imageUrl]);

  const imageUrl = resolveImageUrl();
  const isOwner = account && nft.owner && account.toLowerCase() === nft.owner.toLowerCase();
  const royaltyPercent = nft.royaltyBps ? (nft.royaltyBps / 100).toFixed(1) : null;
  const displayAttributes = (nft.attributes || []).slice(0, 3);

  return (
    <div className="group relative rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] transition-all duration-300">
      {/* Image Container */}
      <div className="relative aspect-square overflow-hidden bg-[#141428]">
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 animate-pulse">
            <div className="w-full h-full bg-gradient-to-br from-purple-500/10 to-pink-500/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-10 h-10 text-white/20 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
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
            alt={nft.name || `NFT #${nft.tokenId}`}
            className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-110 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setImageError(true);
              setImageLoaded(true);
            }}
          />
        )}

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
          <p className="text-white font-bold text-lg truncate">{nft.name || `NFT #${nft.tokenId}`}</p>
        </div>

        {/* Token ID badge top-left */}
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs font-semibold text-white/90 border border-white/10">
          #{nft.tokenId}
        </div>

        {/* Favorite heart top-right */}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(nft.tokenId);
            }}
            className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm border border-white/10 hover:bg-black/80 transition-all duration-200 hover:scale-110"
          >
            {isFavorite ? (
              <svg className="w-5 h-5 text-red-500 fill-current" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white/70 hover:text-red-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </button>
        )}

        {/* Royalty badge */}
        {royaltyPercent && parseFloat(royaltyPercent) > 0 && (
          <div className="absolute bottom-3 left-3 bg-purple-500/80 backdrop-blur-sm rounded-lg px-2 py-0.5 text-xs font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {royaltyPercent}% Royalty
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        {/* Name */}
        <h3 className="text-white font-bold text-lg truncate">
          {nft.name || `NFT #${nft.tokenId}`}
        </h3>

        {/* Creator */}
        {nft.creator && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-white/40">Creator</span>
            <Link
              to={`/profile/${nft.creator}`}
              className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              {shortenAddress(nft.creator)}
            </Link>
          </div>
        )}

        {/* Owner (if different from creator) */}
        {nft.owner && nft.creator && nft.owner.toLowerCase() !== nft.creator.toLowerCase() && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-white/40">Owner</span>
            <Link
              to={`/profile/${nft.owner}`}
              className="text-pink-400 hover:text-pink-300 transition-colors font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              {shortenAddress(nft.owner)}
            </Link>
          </div>
        )}

        {/* Attributes */}
        {displayAttributes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {displayAttributes.map((attr, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2 py-0.5 text-xs"
              >
                <span className="text-purple-300/60">{attr.trait_type}:</span>
                <span className="text-purple-200 font-medium">{attr.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* Listing Price */}
        {listing && (
          <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 320 512" fill="currentColor">
                <path d="M311.9 260.8L160 353.6 8 260.8 160 0l151.9 260.8zM160 383.4L8 290.6 160 512l152-221.4-152 92.8z" />
              </svg>
              <span className="text-white font-bold text-sm">
                {parseFloat(listing.price).toFixed(4)} ETH
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {listing.isAuction ? 'Auction' : 'For Sale'}
            </span>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <Link
            to={`/nft/${nft.tokenId}`}
            className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 hover:from-purple-300 hover:to-pink-300 transition-all"
          >
            View Details →
          </Link>

          {showActions && isOwner && (
            <div className="flex items-center gap-2">
              {/* Transfer icon */}
              <Link
                to={`/nft/${nft.tokenId}?action=transfer`}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all"
                title="Transfer"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </Link>

              {/* List icon */}
              <Link
                to={`/nft/${nft.tokenId}?action=list`}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all"
                title="List for Sale"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NFTCard;
