import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { shortenAddress, formatEth, formatDate, formatTimeRemaining, resolveIpfsUrl, copyToClipboard } from '../utils/helpers';
import CreateListing from './CreateListing';
import TransferNFT from './TransferNFT';
import BurnConfirmation from './BurnConfirmation';
import { fetchApi } from '../utils/api';

const MyNFTs = ({ account, contract, marketplace, favorites, connectWallet, refreshKey, forceNonce }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'favorites' ? 'favorites' : 'owned';

  const [nfts, setNfts] = useState([]);
  const [favoriteNfts, setFavoriteNfts] = useState([]);
  const [offersMap, setOffersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [favLoading, setFavLoading] = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [showListingModal, setShowListingModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const switchTab = (tab) => {
    setSearchParams(tab === 'favorites' ? { tab: 'favorites' } : {});
  };

  const fetchNFTs = useCallback(async ({ force = false } = {}) => {
    if (!account || !contract.getNFTsByOwner) return;
    setLoading(true);
    try {
      const owned = await contract.getNFTsByOwner(account, { force });
      setNfts(owned);

      const offersResults = {};
      await Promise.all(
        owned.map(async (nft) => {
          try {
            const offers = await marketplace.getOffersForToken(nft.tokenId);
            if (offers && offers.length > 0) {
              offersResults[nft.tokenId] = offers;
            }
          } catch (err) {
            console.error(`Failed to fetch offers for token ${nft.tokenId}:`, err);
          }
        })
      );
      setOffersMap(offersResults);
    } catch (err) {
      console.error('Failed to fetch NFTs:', err);
      toast.error('Failed to load your NFTs');
    } finally {
      setLoading(false);
    }
  }, [account, contract, marketplace]);

  // Fetch favorited NFTs by their tokenIds
  const fetchFavoriteNFTs = useCallback(async ({ force = false } = {}) => {
    if (!account || !favorites || !contract.getNFTById) return;
    const favIds = favorites.getFavoritesList();
    if (favIds.length === 0) {
      setFavoriteNfts([]);
      return;
    }
    setFavLoading(true);
    try {
      const missingIds = [];
      const results = await Promise.all(
        favIds.map(async (tokenId) => {
          try {
            const nft = await contract.getNFTById(tokenId, { force });
            if (!nft) {
              missingIds.push(tokenId);
            }
            return nft;
          } catch {
            missingIds.push(tokenId);
            return null;
          }
        })
      );
      if (missingIds.length > 0) {
        favorites.pruneFavorites(missingIds);
      }
      setFavoriteNfts(results.filter(Boolean));
    } catch (err) {
      console.error('Failed to fetch favorite NFTs:', err);
      toast.error('Failed to load favorites');
    } finally {
      setFavLoading(false);
    }
  }, [account, favorites, contract]);

  useEffect(() => {
    fetchNFTs({ force: false });
  }, [fetchNFTs, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) {
      fetchNFTs({ force: true });
    }
  }, [fetchNFTs, forceNonce]);

  // Fetch favorites when switching to the favorites tab or when favorites change
  useEffect(() => {
    if (activeTab === 'favorites') {
      fetchFavoriteNFTs({ force: false });
    }
  }, [activeTab, fetchFavoriteNFTs, favorites?.favorites?.size, refreshKey]);

  useEffect(() => {
    if (activeTab === 'favorites' && forceNonce > 0) {
      fetchFavoriteNFTs({ force: true });
    }
  }, [activeTab, fetchFavoriteNFTs, forceNonce]);

  const handleListForSale = (nft) => {
    setSelectedToken(nft);
    setShowListingModal(true);
  };

  const handleTransfer = (nft) => {
    setSelectedToken(nft);
    setShowTransferModal(true);
  };

  const handleBurn = (nft) => {
    setSelectedToken(nft);
    setShowBurnModal(true);
  };

  const onCreateListing = async (tokenId, price, isAuction, reservePrice, duration) => {
    setActionLoading((prev) => ({ ...prev, [`list-${tokenId}`]: true }));
    try {
      toast.loading('Approving marketplace...', { id: 'approve' });
      await contract.approveMarketplace(tokenId);
      toast.success('Marketplace approved', { id: 'approve' });

      if (isAuction) {
        toast.loading('Creating auction...', { id: 'listing' });
        await marketplace.createAuction(tokenId, price, reservePrice || '0', duration);
        toast.success('Auction created successfully!', { id: 'listing' });
      } else {
        toast.loading('Creating listing...', { id: 'listing' });
        await marketplace.createListing(tokenId, price);
        toast.success('Listing created successfully!', { id: 'listing' });
      }
      setShowListingModal(false);
      setSelectedToken(null);
      fetchNFTs({ force: true });
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Failed to create listing:', err);
      toast.error(err.reason || 'Failed to create listing', { id: 'listing' });
      toast.dismiss('approve');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`list-${tokenId}`]: false }));
    }
  };

  const onTransfer = async (tokenId, recipientAddress) => {
    setActionLoading((prev) => ({ ...prev, [`transfer-${tokenId}`]: true }));
    try {
      toast.loading('Transferring NFT...', { id: 'transfer' });
      await contract.transferNFT(account, recipientAddress, tokenId);
      toast.success('NFT transferred successfully!', { id: 'transfer' });
      setShowTransferModal(false);
      setSelectedToken(null);
      fetchNFTs({ force: true });
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Failed to transfer NFT:', err);
      toast.error(err.reason || 'Failed to transfer NFT', { id: 'transfer' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`transfer-${tokenId}`]: false }));
    }
  };

  const onBurn = async (tokenId) => {
    setActionLoading((prev) => ({ ...prev, [`burn-${tokenId}`]: true }));
    try {
      toast.loading('Burning NFT...', { id: 'burn' });
      await contract.burnNFT(tokenId);
      toast.success('NFT burned successfully!', { id: 'burn' });
      
      // Clear backend caches immediately after burn to prevent stale data.
      try {
        await Promise.allSettled([
          fetchApi('/api/nfts/cache/clear', { method: 'POST' }, { expectJson: true }),
          fetchApi('/api/history/cache/clear', { method: 'POST' }, { expectJson: true }),
        ]);
        console.log('✅ Backend NFT/history caches cleared');
      } catch (cacheErr) {
        console.warn('⚠️ Failed to clear backend caches, refetching from fresh state...', cacheErr);
      }
      
      // Optimistic UI update:
      // Your server caches `/api/nfts` for a short TTL, so an immediate refetch
      // can temporarily return stale data. Removing locally makes the UX feel instant.
      setNfts((prev) => prev.filter((n) => Number(n.tokenId) !== Number(tokenId)));
      setFavoriteNfts((prev) => prev.filter((n) => Number(n.tokenId) !== Number(tokenId)));
      favorites?.pruneFavorites([tokenId]);
      setOffersMap((prev) => {
        const next = { ...prev };
        delete next[tokenId];
        return next;
      });
      setShowBurnModal(false);
      setSelectedToken(null);
      fetchNFTs({ force: true });
      // Keep pages in sync immediately after burn.
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Failed to burn NFT:', err);
      toast.error(err.reason || 'Failed to burn NFT', { id: 'burn' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`burn-${tokenId}`]: false }));
    }
  };

  const onAcceptOffer = async (tokenId, offerId) => {
    setActionLoading((prev) => ({ ...prev, [`accept-${offerId}`]: true }));
    try {
      toast.loading('Approving marketplace...', { id: 'approve-offer' });
      await contract.approveMarketplace(tokenId);
      toast.success('Marketplace approved', { id: 'approve-offer' });

      toast.loading('Accepting offer...', { id: 'accept-offer' });
      await marketplace.acceptOffer(offerId);
      toast.success('Offer accepted successfully!', { id: 'accept-offer' });
      fetchNFTs({ force: true });
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
    } catch (err) {
      console.error('Failed to accept offer:', err);
      toast.error(err.reason || 'Failed to accept offer', { id: 'accept-offer' });
      toast.dismiss('approve-offer');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`accept-${offerId}`]: false }));
    }
  };

  /* ─── Wallet guard ─── */
  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Wallet Not Connected</h2>
          <p className="text-gray-400 mb-6">Connect your wallet to view your NFTs and favorites</p>
          {connectWallet && (
            <button
              onClick={connectWallet}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
            >
              🦊 Connect MetaMask
            </button>
          )}
        </div>
      </div>
    );
  }

  const SkeletonCard = () => (
    <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-square bg-white/10" />
      <div className="p-4 space-y-3">
        <div className="h-5 bg-white/10 rounded w-3/4" />
        <div className="h-4 bg-white/10 rounded w-1/2" />
        <div className="flex gap-2 mt-4">
          <div className="h-9 bg-white/10 rounded-xl flex-1" />
          <div className="h-9 bg-white/10 rounded-xl flex-1" />
          <div className="h-9 bg-white/10 rounded-xl flex-1" />
        </div>
      </div>
    </div>
  );

  /* ─── Shared NFT card renderer ─── */
  const renderNFTCard = (nft, isOwned) => {
    const tokenOffers = offersMap[nft.tokenId] || [];
    const imageUrl = resolveIpfsUrl(nft.imageUrl || nft.image);
    const isCreator = nft.creator && nft.creator.toLowerCase() === account.toLowerCase();
    const isOwnedByUser = nft.owner && nft.owner.toLowerCase() === account.toLowerCase();

    return (
      <div
        key={nft.tokenId}
        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:scale-[1.02] transition-all duration-300 hover:border-purple-500/30 group"
      >
        {/* Image Section */}
        <div className="relative aspect-square overflow-hidden">
          <Link to={`/nft/${nft.tokenId}`}>
            <img
              src={imageUrl}
              alt={nft.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              onError={(e) => {
                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiMxNDE0MjgiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCIgZm9udC1zaXplPSIxNiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
              }}
            />
          </Link>
          {/* Favorite Toggle */}
          <button
            onClick={() => favorites.toggleFavorite(nft.tokenId)}
            className="absolute top-3 right-3 w-10 h-10 rounded-full backdrop-blur-xl bg-black/40 border border-white/10 flex items-center justify-center hover:bg-black/60 transition-colors"
          >
            {favorites.isFavorite(nft.tokenId) ? (
              <svg className="w-5 h-5 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </button>
          {/* Token ID Badge */}
          <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-xs text-white font-mono">
            #{nft.tokenId}
          </span>
        </div>

        {/* Info Section */}
        <div className="p-4">
          <Link to={`/nft/${nft.tokenId}`}>
            <h3 className="text-lg font-bold text-white mb-1 hover:text-purple-400 transition-colors truncate">
              {nft.name}
            </h3>
          </Link>

          {/* Creator Badge */}
          {isCreator && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium mb-2">
              Created by you
            </span>
          )}

          {/* Owner info (on favorites tab when not owned) */}
          {!isOwned && !isOwnedByUser && nft.owner && (
            <p className="text-xs text-gray-400 mb-2">
              Owned by <span className="text-purple-400">{shortenAddress(nft.owner)}</span>
            </p>
          )}
          {!isOwned && isOwnedByUser && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium mb-2">
              You own this
            </span>
          )}

          {/* Attributes */}
          {nft.attributes && nft.attributes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {nft.attributes.slice(0, 3).map((attr, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-gray-300"
                >
                  {attr.trait_type}: {attr.value}
                </span>
              ))}
              {nft.attributes.length > 3 && (
                <span className="px-2 py-0.5 rounded-md bg-white/5 text-xs text-gray-500">
                  +{nft.attributes.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Action Buttons — only for owned NFTs */}
          {isOwned && (
            <>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => handleListForSale(nft)}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  List for Sale
                </button>
                <button
                  onClick={() => handleTransfer(nft)}
                  className="flex-1 backdrop-blur-xl bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/10 transition-colors"
                >
                  Transfer
                </button>
                <button
                  onClick={() => handleBurn(nft)}
                  className="backdrop-blur-xl bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-red-500/20 transition-colors"
                >
                  Burn
                </button>
              </div>

              {/* Offers Section */}
              {tokenOffers.length > 0 && (
                <div className="border-t border-white/10 pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-white">Offers</span>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                      {tokenOffers.length}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {tokenOffers.map((offer) => (
                      <div
                        key={offer.offerId}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium">
                            {formatEth(offer.amount)} ETH
                          </p>
                          <p className="text-xs text-gray-400">
                            from {shortenAddress(offer.buyer)}
                          </p>
                          <p className="text-xs text-gray-500">
                            Expires {formatTimeRemaining(offer.expiry)}
                          </p>
                        </div>
                        <button
                          onClick={() => onAcceptOffer(nft.tokenId, offer.offerId)}
                          disabled={actionLoading[`accept-${offer.offerId}`]}
                          className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {actionLoading[`accept-${offer.offerId}`] ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            'Accept'
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* View button for favorites that aren't owned */}
          {!isOwned && (
            <Link
              to={`/nft/${nft.tokenId}`}
              className="block w-full text-center bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-3 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              View Details
            </Link>
          )}
        </div>
      </div>
    );
  };

  const isLoading = activeTab === 'owned' ? loading : favLoading;
  const displayNfts = activeTab === 'owned' ? nfts : favoriteNfts;
  const favCount = favorites?.count || 0;

  return (
    <div className="flex-1 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-3xl font-bold text-white">My NFTs</h1>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
          <button
            onClick={() => switchTab('owned')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === 'owned'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Owned
            {!loading && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === 'owned' ? 'bg-white/20' : 'bg-white/10'
              }`}>
                {nfts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => switchTab('favorites')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'favorites'
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
            </svg>
            Favorites
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'favorites' ? 'bg-white/20' : 'bg-white/10'
            }`}>
              {favCount}
            </span>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Empty State — Owned */}
        {!isLoading && activeTab === 'owned' && nfts.length === 0 && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">You don't own any NFTs yet</h2>
            <p className="text-gray-400 mb-6">Start your collection by minting your first NFT</p>
            <Link
              to="/mint"
              className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
            >
              Mint an NFT
            </Link>
          </div>
        )}

        {/* Empty State — Favorites */}
        {!isLoading && activeTab === 'favorites' && favoriteNfts.length === 0 && (
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">No favorites yet</h2>
            <p className="text-gray-400 mb-6">Browse the gallery and tap the ❤️ on NFTs you like</p>
            <Link
              to="/gallery"
              className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
            >
              Browse Gallery
            </Link>
          </div>
        )}

        {/* NFT Grid */}
        {!isLoading && displayNfts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {displayNfts.map((nft) => renderNFTCard(nft, activeTab === 'owned'))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showListingModal && selectedToken && (
        <CreateListing
          isOpen={showListingModal}
          onClose={() => {
            setShowListingModal(false);
            setSelectedToken(null);
          }}
          tokenId={selectedToken.tokenId}
          tokenName={selectedToken.name}
          onCreateListing={onCreateListing}
          loading={actionLoading[`list-${selectedToken.tokenId}`] || marketplace.loading}
        />
      )}

      {showTransferModal && selectedToken && (
        <TransferNFT
          isOpen={showTransferModal}
          onClose={() => {
            setShowTransferModal(false);
            setSelectedToken(null);
          }}
          tokenId={selectedToken.tokenId}
          tokenName={selectedToken.name}
          onTransfer={onTransfer}
          loading={actionLoading[`transfer-${selectedToken.tokenId}`] || contract.loading}
        />
      )}

      {showBurnModal && selectedToken && (
        <BurnConfirmation
          isOpen={showBurnModal}
          onClose={() => {
            setShowBurnModal(false);
            setSelectedToken(null);
          }}
          tokenId={selectedToken.tokenId}
          tokenName={selectedToken.name}
          onBurn={onBurn}
          loading={actionLoading[`burn-${selectedToken.tokenId}`] || contract.loading}
        />
      )}
    </div>
  );
};

export default MyNFTs;
