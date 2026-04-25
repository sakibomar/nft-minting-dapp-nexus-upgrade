/**
 * @file CreateListing.jsx
 * @description Modal for creating fixed-price or auction listings on the marketplace.
 *
 * FIX APPLIED (Bug #7 + #8):
 *   - Previously had TWO callback props: onCreateListing (fixed) + onCreateAuction (auction).
 *     MyNFTs.jsx only passed onCreateListing — so onCreateAuction was always undefined,
 *     making the "Create Auction Listing" button completely dead (silent no-op).
 *   - Now uses a SINGLE onCreateListing callback for both types.
 *     For fixed: onCreateListing(tokenId, price)
 *     For auction: onCreateListing(tokenId, startPrice, true, reservePrice, duration)
 *     The third arg (isAuction=true) tells MyNFTs.onCreateListing to route to createAuction().
 */

import React, { useState } from 'react';
import toast from 'react-hot-toast';

const DURATION_OPTIONS = [
  { label: '1 Hour', value: 3600 },
  { label: '6 Hours', value: 21600 },
  { label: '12 Hours', value: 43200 },
  { label: '1 Day', value: 86400 },
  { label: '3 Days', value: 259200 },
  { label: '7 Days', value: 604800 },
  { label: '14 Days', value: 1209600 },
  { label: '30 Days', value: 2592000 },
];

const CreateListing = ({ isOpen, onClose, onCreateListing, tokenId, tokenName, loading }) => {
  const [activeTab, setActiveTab] = useState('fixed');
  const [fixedPrice, setFixedPrice] = useState('');
  const [auctionStartPrice, setAuctionStartPrice] = useState('');
  const [auctionReservePrice, setAuctionReservePrice] = useState('');
  const [auctionDuration, setAuctionDuration] = useState(86400);

  if (!isOpen) return null;

  const handleCreateFixed = () => {
    if (!fixedPrice || parseFloat(fixedPrice) <= 0) {
      toast.error('Please enter a valid price');
      return;
    }
    if (onCreateListing) {
      // onCreateListing(tokenId, price) — isAuction omitted = falsy
      onCreateListing(tokenId, fixedPrice);
    }
  };

  const handleCreateAuction = () => {
    if (!auctionStartPrice || parseFloat(auctionStartPrice) <= 0) {
      toast.error('Please enter a valid starting price');
      return;
    }
    if (onCreateListing) {
      // onCreateListing(tokenId, startPrice, isAuction, reservePrice, duration)
      onCreateListing(tokenId, auctionStartPrice, true, auctionReservePrice || '0', auctionDuration);
    }
  };

  const getDurationLabel = (val) => {
    const opt = DURATION_OPTIONS.find((d) => d.value === val);
    return opt ? opt.label : `${val}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md backdrop-blur-xl bg-[#141428]/95 border border-white/10 rounded-2xl shadow-2xl shadow-purple-500/10 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold text-white">Create Listing</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-white/40 text-sm">
            List <span className="text-purple-400 font-medium">{tokenName || `Token #${tokenId}`}</span> on the marketplace
          </p>
        </div>

        {/* Tabs */}
        <div className="px-6 mb-4">
          <div className="flex bg-white/5 rounded-xl border border-white/10 p-1">
            <button
              onClick={() => setActiveTab('fixed')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'fixed'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Fixed Price
            </button>
            <button
              onClick={() => setActiveTab('auction')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'auction'
                  ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Auction
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-5">
          {activeTab === 'fixed' && (
            <>
              {/* Fixed Price Input */}
              <div>
                <label className="block text-white/70 text-sm font-semibold mb-2">Price (ETH)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-all pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-semibold text-sm">ETH</span>
                </div>
              </div>

              {/* Preview Summary */}
              {fixedPrice && parseFloat(fixedPrice) > 0 && (
                <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                  <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wide">Summary</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Token</span>
                    <span className="text-white font-medium">{tokenName || `#${tokenId}`}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Type</span>
                    <span className="text-emerald-400 font-medium">Fixed Price</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Price</span>
                    <span className="text-white font-bold">{fixedPrice} ETH</span>
                  </div>
                </div>
              )}

              {/* Create Button */}
              <button
                onClick={handleCreateFixed}
                disabled={!fixedPrice || parseFloat(fixedPrice) <= 0 || loading}
                className="w-full py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating Listing...
                  </>
                ) : (
                  'Create Fixed Price Listing'
                )}
              </button>
            </>
          )}

          {activeTab === 'auction' && (
            <>
              {/* Starting Price */}
              <div>
                <label className="block text-white/70 text-sm font-semibold mb-2">Starting Price (ETH)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={auctionStartPrice}
                    onChange={(e) => setAuctionStartPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-all pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-semibold text-sm">ETH</span>
                </div>
              </div>

              {/* Reserve Price */}
              <div>
                <label className="block text-white/70 text-sm font-semibold mb-2">
                  Reserve Price (ETH)
                  <span className="text-white/30 font-normal ml-1">— optional</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={auctionReservePrice}
                    onChange={(e) => setAuctionReservePrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-all pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-semibold text-sm">ETH</span>
                </div>
                <p className="text-white/30 text-xs mt-1">Minimum price that must be met for the auction to complete</p>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-white/70 text-sm font-semibold mb-2">Auction Duration</label>
                <select
                  value={auctionDuration}
                  onChange={(e) => setAuctionDuration(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-all appearance-none cursor-pointer"
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#141428]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Preview Summary */}
              {auctionStartPrice && parseFloat(auctionStartPrice) > 0 && (
                <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
                  <h4 className="text-white/60 text-xs font-semibold uppercase tracking-wide">Summary</h4>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Token</span>
                    <span className="text-white font-medium">{tokenName || `#${tokenId}`}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Type</span>
                    <span className="text-orange-400 font-medium">Auction</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Starting Price</span>
                    <span className="text-white font-bold">{auctionStartPrice} ETH</span>
                  </div>
                  {auctionReservePrice && parseFloat(auctionReservePrice) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Reserve Price</span>
                      <span className="text-white/70">{auctionReservePrice} ETH</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Duration</span>
                    <span className="text-white/70">{getDurationLabel(auctionDuration)}</span>
                  </div>
                </div>
              )}

              {/* Create Button */}
              <button
                onClick={handleCreateAuction}
                disabled={!auctionStartPrice || parseFloat(auctionStartPrice) <= 0 || loading}
                className="w-full py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white shadow-lg shadow-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating Auction...
                  </>
                ) : (
                  'Create Auction Listing'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateListing;
