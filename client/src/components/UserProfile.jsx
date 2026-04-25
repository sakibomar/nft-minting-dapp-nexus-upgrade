import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { shortenAddress, formatEth, formatDate, formatTimeRemaining, copyToClipboard, resolveIpfsUrl } from '../utils/helpers';
import { ETHERSCAN_BASE } from '../utils/constants';
import { fetchApiJson } from '../utils/api';

const generateAvatarColor = (address) => {
  if (!address) return '#8b5cf6';
  const hex = address.slice(2, 8);
  return `#${hex}`;
};

const generateAvatarGradient = (address) => {
  if (!address) return 'from-purple-500 to-pink-500';
  const c1 = address.slice(2, 8);
  const c2 = address.slice(8, 14);
  return { color1: `#${c1}`, color2: `#${c2}` };
};

const UserProfile = ({ account, contract, marketplace, refreshKey, forceNonce }) => {
  const { address } = useParams();
  const [nfts, setNfts] = useState([]);
  const [listings, setListings] = useState([]);
  const [offers, setOffers] = useState([]);
  const [createdCount, setCreatedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('owned');

  const isOwnProfile = account && address && account.toLowerCase() === address.toLowerCase();
  const avatarGradient = generateAvatarGradient(address);

  const fetchProfileData = useCallback(async ({ force = false } = {}) => {
    if (!address) return;
    setLoading(true);
    try {
      const historyParams = new URLSearchParams({
        address,
        type: 'mint',
      });
      if (force) historyParams.set('force', '1');
      const historyUrl = `/api/history?${historyParams.toString()}`;

      const [ownedNfts, activeListings, mintHistoryRes] = await Promise.all([
        contract.getNFTsByOwner(address, { force }).catch(() => []),
        marketplace.getActiveListings({ force }).catch(() => []),
        fetchApiJson(historyUrl)
          .then(({ res, data }) => (res.ok ? data : null))
          .catch(() => null),
      ]);

      setNfts(ownedNfts || []);
      setCreatedCount(
        mintHistoryRes?.success
          ? Array.isArray(mintHistoryRes.events)
            ? mintHistoryRes.events.length
            : Number(mintHistoryRes.count || 0)
          : (ownedNfts || []).filter(
              (nft) => nft.creator && nft.creator.toLowerCase() === address.toLowerCase()
            ).length
      );

      const userListings = (activeListings || []).filter(
        (l) => l.active && l.seller && l.seller.toLowerCase() === address.toLowerCase()
      );
      setListings(userListings);

      if (isOwnProfile) {
        try {
          const userOffers = await marketplace.getOffersByBuyer(address);
          setOffers(userOffers || []);
        } catch (err) {
          console.error('Failed to fetch offers:', err);
          setOffers([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch profile data:', err);
      toast.error('Failed to load profile data');
    } finally {
      setLoading(false);
    }
  }, [address, account, contract, marketplace, isOwnProfile]);

  useEffect(() => {
    fetchProfileData({ force: false });
  }, [fetchProfileData, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) {
      fetchProfileData({ force: true });
    }
  }, [fetchProfileData, forceNonce]);

  const tabs = [
    { id: 'owned', label: 'Owned NFTs', count: nfts.length },
    { id: 'listings', label: 'Listings', count: listings.length },
  ];

  if (isOwnProfile) {
    tabs.push({ id: 'offers', label: 'Offers Made', count: offers.length });
  }

  const SkeletonCard = () => (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-square bg-white/10" />
      <div className="p-4 space-y-2">
        <div className="h-5 bg-white/10 rounded w-3/4" />
        <div className="h-4 bg-white/10 rounded w-1/2" />
      </div>
    </div>
  );

  return (
    <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Profile Header */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar */}
            <div
              className="w-24 h-24 rounded-full flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${avatarGradient.color1}, ${avatarGradient.color2})`,
              }}
            />

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex items-center gap-3 justify-center sm:justify-start mb-2">
                <h1 className="text-2xl font-bold text-white font-mono break-all">
                  {address}
                </h1>
              </div>
              <div className="flex items-center gap-3 justify-center sm:justify-start">
                <button
                  onClick={() => {
                    copyToClipboard(address);
                    toast.success('Address copied!');
                  }}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </button>
                <a
                  href={`${ETHERSCAN_BASE}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-purple-400 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Etherscan
                </a>
                {isOwnProfile && (
                  <span className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold">
                    This is you
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mt-8">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{loading ? '—' : nfts.length}</p>
              <p className="text-sm text-gray-400">NFTs Owned</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{loading ? '—' : listings.length}</p>
              <p className="text-sm text-gray-400">NFTs Listed</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{loading ? '—' : createdCount}</p>
              <p className="text-sm text-gray-400">NFTs Created</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/10 pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 rounded-t-xl font-semibold text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-white/10 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-white/5 text-gray-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <>
            {/* Owned NFTs Tab */}
            {activeTab === 'owned' && (
              <>
                {nfts.length === 0 ? (
                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-400">No NFTs owned</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {nfts.map((nft) => (
                      <Link
                        key={nft.tokenId}
                        to={`/nft/${nft.tokenId}`}
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:scale-[1.02] transition-all duration-300 hover:border-purple-500/30 group"
                      >
                        <div className="aspect-square overflow-hidden">
                          <img
                            src={resolveIpfsUrl(nft.imageUrl || nft.image)}
                            alt={nft.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            onError={(e) => {
                              e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiMxNDE0MjgiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCIgZm9udC1zaXplPSIxNiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                            }}
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="text-lg font-bold text-white mb-1 truncate group-hover:text-purple-400 transition-colors">
                            {nft.name}
                          </h3>
                          <p className="text-sm text-gray-400 font-mono">#{nft.tokenId}</p>
                          {nft.creator && nft.creator.toLowerCase() === address.toLowerCase() && (
                            <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                              Creator
                            </span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Listings Tab */}
            {activeTab === 'listings' && (
              <>
                {listings.length === 0 ? (
                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                    </div>
                    <p className="text-gray-400">No active listings</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {listings.map((listing) => (
                      <Link
                        key={listing.listingId}
                        to={`/nft/${listing.tokenId}`}
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:scale-[1.02] transition-all duration-300 hover:border-purple-500/30 group"
                      >
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-gray-400 font-mono">#{listing.tokenId}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              listing.isAuction
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-green-500/20 text-green-400'
                            }`}>
                              {listing.isAuction ? 'Auction' : 'Fixed Price'}
                            </span>
                          </div>
                          <p className="text-2xl font-bold text-white mb-2">
                            {formatEth(listing.price)} ETH
                          </p>
                          {listing.isAuction && listing.highestBid && listing.highestBid !== '0' && (
                            <p className="text-sm text-gray-400 mb-2">
                              Highest Bid: {formatEth(listing.highestBid)} ETH
                            </p>
                          )}
                          {listing.isAuction && listing.endTime && (
                            <p className="text-sm text-orange-400">
                              {Date.now() / 1000 > Number(listing.endTime)
                                ? 'Auction Ended'
                                : `Ends ${formatTimeRemaining(listing.endTime)}`}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Offers Tab */}
            {activeTab === 'offers' && isOwnProfile && (
              <>
                {offers.length === 0 ? (
                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <p className="text-gray-400">No offers made</p>
                  </div>
                ) : (
                  <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Token</th>
                          <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Amount</th>
                          <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Expires</th>
                          <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Status</th>
                          <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {offers.map((offer) => (
                          <tr key={offer.offerId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                              <Link
                                to={`/nft/${offer.tokenId}`}
                                className="text-purple-400 hover:text-purple-300 font-mono text-sm transition-colors"
                              >
                                #{offer.tokenId}
                              </Link>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-white font-semibold">{formatEth(offer.amount)} ETH</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-gray-400 text-sm">
                                {offer.expiry ? formatTimeRemaining(offer.expiry) : '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                offer.status === 'active' || !offer.status
                                  ? 'bg-green-500/20 text-green-400'
                                  : offer.status === 'accepted'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}>
                                {offer.status || 'Active'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Link
                                to={`/nft/${offer.tokenId}`}
                                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                              >
                                View NFT →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
