import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { shortenAddress, formatEth, formatDate, formatTimeRemaining, getEtherscanUrl, resolveIpfsUrl, copyToClipboard } from '../utils/helpers';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, MARKETPLACE_ADDRESS, ETHERSCAN_BASE } from '../utils/constants';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import CreateListing from './CreateListing';
import TransferNFT from './TransferNFT';
import BurnConfirmation from './BurnConfirmation';
import MakeOffer from './MakeOffer';
import { fetchApi, fetchApiJson } from '../utils/api';

const NFTDetail = ({ account, contract, marketplace, favorites, refreshKey, forceNonce }) => {
  const { tokenId } = useParams();
  const navigate = useNavigate();

  const [nft, setNft] = useState(null);
  const [offers, setOffers] = useState([]);
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [bidAmount, setBidAmount] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [showEditPrice, setShowEditPrice] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [traitRarity, setTraitRarity] = useState({});
  const [activityEvents, setActivityEvents] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);

  // Modals
  const [showListingModal, setShowListingModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showBurnModal, setShowBurnModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const ZERO_ADDRESS = ethers.ZeroAddress.toLowerCase();

  const renderActivityAddress = (address, fallbackLabel = '—') => {
    if (!address) return <span className="text-gray-500">{fallbackLabel}</span>;

    const normalized = address.toLowerCase();

    if (normalized === ZERO_ADDRESS) {
      return <span className="text-gray-500 text-sm">Zero Address</span>;
    }

    if (normalized === MARKETPLACE_ADDRESS.toLowerCase()) {
      return <span className="text-gray-500 text-sm">Marketplace</span>;
    }

    return (
      <a
        href={`${ETHERSCAN_BASE}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-purple-400 hover:text-purple-300 font-mono text-sm transition-colors"
      >
        {shortenAddress(address)}
      </a>
    );
  };

  const isOwner = nft && account && nft.owner.toLowerCase() === account.toLowerCase();
  const isCreator = nft && account && nft.creator.toLowerCase() === account.toLowerCase();
  const isAuction = listing && listing.isAuction;
  const isFixedPrice = listing && !listing.isAuction;
  const isSeller = listing && account && listing.seller.toLowerCase() === account.toLowerCase();
  // FIX: API returns 'auctionEndTime' not 'endTime' — was undefined → NaN → "NaNm"
  const auctionEnded = isAuction && listing.auctionEndTime && Date.now() / 1000 > Number(listing.auctionEndTime);

  const fetchNFTData = useCallback(async ({ force = false } = {}) => {
    if (!tokenId) return;
    setLoading(true);
    try {
      const nftData = await contract.getNFTById(tokenId, { force });
      setNft(nftData);

      const [offersData, allListings] = await Promise.all([
        marketplace.getOffersForToken(tokenId).catch(() => []),
        marketplace.getActiveListings({ force }).catch(() => []),
      ]);

      setOffers(offersData || []);

      const activeListing = (allListings || []).find(
        (l) => l.tokenId.toString() === tokenId.toString()
      );
      setListing(activeListing || null);
    } catch (err) {
      console.error('Failed to fetch NFT data:', err);
      toast.error('Failed to load NFT details');
    } finally {
      setLoading(false);
    }
  }, [tokenId, contract, marketplace]);

  useEffect(() => {
    fetchNFTData({ force: false });
  }, [fetchNFTData, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) fetchNFTData({ force: true });
  }, [fetchNFTData, forceNonce]);

  // Compute trait rarity percentages across all NFTs in the collection
  useEffect(() => {
    if (!nft?.attributes?.length) return;

    const computeRarity = async () => {
      try {
        const { data } = await fetchApiJson('/api/nfts');
        if (!data.success || !data.nfts?.length) return;

        const totalNFTs = data.nfts.length;
        const traitCounts = {};

        data.nfts.forEach((n) => {
          (n.attributes || []).forEach((attr) => {
            const key = `${attr.trait_type}:::${attr.value}`;
            traitCounts[key] = (traitCounts[key] || 0) + 1;
          });
        });

        const rarity = {};
        Object.entries(traitCounts).forEach(([key, count]) => {
          rarity[key] = Math.round((count / totalNFTs) * 100);
        });

        setTraitRarity(rarity);
      } catch (err) {
        console.error('Failed to compute trait rarity:', err);
      }
    };

    computeRarity();
  }, [nft]);

  // ─── Activity & Price History (on-chain events) ──────────────────────
  const fetchActivity = useCallback(async (force = false) => {
      if (!tokenId) return;
      try {
        const query = force ? '?force=1' : '';
        const { res, data } = await fetchApiJson(`/api/history/${tokenId}${query}`);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch activity history');
        }
        const events = (data?.events || [])
          .map((event) => {
            const eventType = String(event.eventType || '').toLowerCase();
            let type = null;

            if (eventType === 'mint') type = 'Mint';
            else if (eventType === 'burn') type = 'Burn';
            else if (eventType === 'transfer') type = 'Transfer';
            else if (eventType === 'listed') type = event.isAuction ? 'Auction' : 'Listing';
            else if (eventType === 'bid') type = 'Bid';
            else if (eventType === 'sale' || eventType === 'auction_settled' || eventType === 'offer_accepted') type = 'Sale';

            if (!type || !event.txHash) return null;

            return {
              type,
              from: event.from || null,
              to: event.to || null,
              price: event.value || null,
              timestamp: Number(event.timestamp || 0),
              txHash: event.txHash,
            };
          })
          .filter(Boolean);

        events.sort((a, b) => b.timestamp - a.timestamp);
        setActivityEvents(events);

        const salesForChart = events
          .filter((event) => event.type === 'Sale' && event.price)
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((event) => ({
            date: new Date(event.timestamp * 1000).toLocaleDateString(),
            price: parseFloat(event.price),
            fullDate: new Date(event.timestamp * 1000).toLocaleString(),
          }))
          .filter((event) => Number.isFinite(event.price));

        setPriceHistory(salesForChart);
        return;
      } catch (err) {
        console.warn('Activity fetch failed:', err);
        setActivityEvents([]);
        setPriceHistory([]);
        return;
      }

      if (!window.ethereum) return;
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const nftC = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const mpC = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);

        const events = [];

        // Transfer events (includes mint and burn transfers)
        const transferFilter = nftC.filters.Transfer(null, null, tokenId);
        const transfers = await nftC.queryFilter(transferFilter);
        for (const ev of transfers) {
          const from = ev.args.from;
          const to = ev.args.to;
          const isMint = from?.toLowerCase() === ZERO_ADDRESS;
          const isBurn = to?.toLowerCase() === ZERO_ADDRESS;
          const [block, tx] = await Promise.all([
            ev.getBlock(),
            isMint ? provider.getTransaction(ev.transactionHash).catch(() => null) : Promise.resolve(null),
          ]);

          events.push({
            type: isMint ? 'Mint' : isBurn ? 'Burn' : 'Transfer',
            from,
            to,
            price: isMint && tx && tx.value > 0n ? ethers.formatEther(tx.value) : null,
            timestamp: block.timestamp,
            txHash: ev.transactionHash,
          });
        }

        // Listed events (tokenId is indexed at position 3)
        const listedFilter = mpC.filters.Listed(null, null, null, tokenId);
        const listedEvents = await mpC.queryFilter(listedFilter);
        for (const ev of listedEvents) {
          const block = await ev.getBlock();
          events.push({
            type: ev.args.isAuction ? 'Auction' : 'Listing',
            from: ev.args.seller,
            to: MARKETPLACE_ADDRESS,
            price: ethers.formatEther(ev.args.price),
            timestamp: block.timestamp,
            txHash: ev.transactionHash,
          });
        }

        // Sale events (tokenId NOT indexed — fetch all, filter client-side)
        const allSales = await mpC.queryFilter(mpC.filters.Sale());
        const tokenSales = allSales.filter(
          (ev) => ev.args.tokenId.toString() === tokenId.toString()
        );
        for (const ev of tokenSales) {
          const [block, saleListing] = await Promise.all([
            ev.getBlock(),
            mpC.getListing(ev.args.listingId).catch(() => null),
          ]);
          events.push({
            type: 'Sale',
            from: saleListing?.seller || null,
            to: ev.args.buyer,
            price: ethers.formatEther(ev.args.price),
            timestamp: block.timestamp,
            txHash: ev.transactionHash,
          });
        }

        // BidPlaced — get listingIds from listed events, then query bids
        const listingIds = listedEvents.map((ev) => ev.args.listingId);
        for (const lid of listingIds) {
          const bidFilter = mpC.filters.BidPlaced(lid);
          const bids = await mpC.queryFilter(bidFilter);
          for (const ev of bids) {
            const block = await ev.getBlock();
            events.push({
              type: 'Bid',
              from: ev.args.bidder,
              to: MARKETPLACE_ADDRESS,
              price: ethers.formatEther(ev.args.amount),
              timestamp: block.timestamp,
              txHash: ev.transactionHash,
            });
          }
        }

        // Sort newest first
        events.sort((a, b) => b.timestamp - a.timestamp);
        setActivityEvents(events);

        // Price history = sale events sorted oldest first
        const salesForChart = events
          .filter((e) => e.type === 'Sale' && e.price)
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((e) => ({
            date: new Date(e.timestamp * 1000).toLocaleDateString(),
            price: parseFloat(e.price),
            fullDate: new Date(e.timestamp * 1000).toLocaleString(),
          }));
        setPriceHistory(salesForChart);
      } catch (err) {
        console.warn('Activity fetch failed:', err);
      }
  }, [tokenId]);

  useEffect(() => {
    fetchActivity(false);
  }, [fetchActivity, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) {
      fetchActivity(true);
    }
  }, [fetchActivity, forceNonce]);

  const handleBuyNow = async () => {
    if (!listing) return;
    setActionLoading((prev) => ({ ...prev, buy: true }));
    try {
      toast.loading('Processing purchase...', { id: 'buy' });
      const result = await marketplace.buyNow(listing.listingId, listing.price);
      toast.success(
        <div>
          <p className="font-semibold">NFT purchased successfully! 🎉</p>
          <a
            href={`${ETHERSCAN_BASE}/tx/${result.tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline text-sm"
          >
            View on Etherscan
          </a>
        </div>,
        { id: 'buy', duration: 6000 }
      );
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Buy failed:', err);
      toast.error(err.reason || 'Failed to purchase NFT', { id: 'buy' });
    } finally {
      setActionLoading((prev) => ({ ...prev, buy: false }));
    }
  };

  const handlePlaceBid = async () => {
    if (!listing || !bidAmount) return;
    setActionLoading((prev) => ({ ...prev, bid: true }));
    try {
      toast.loading('Placing bid...', { id: 'bid' });
      const result = await marketplace.placeBid(listing.listingId, bidAmount);
      toast.success(
        <div>
          <p className="font-semibold">Bid placed successfully! 🎯</p>
          <a
            href={`${ETHERSCAN_BASE}/tx/${result.tx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline text-sm"
          >
            View on Etherscan
          </a>
        </div>,
        { id: 'bid', duration: 6000 }
      );
      setBidAmount('');
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Bid failed:', err);
      toast.error(err.reason || 'Failed to place bid', { id: 'bid' });
    } finally {
      setActionLoading((prev) => ({ ...prev, bid: false }));
    }
  };

  const handleCancelListing = async () => {
    if (!listing) return;
    setActionLoading((prev) => ({ ...prev, cancel: true }));
    try {
      toast.loading('Cancelling listing...', { id: 'cancel' });
      await marketplace.cancelListing(listing.listingId);
      toast.success('Listing cancelled successfully!', { id: 'cancel' });
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Cancel failed:', err);
      toast.error(err.reason || 'Failed to cancel listing', { id: 'cancel' });
    } finally {
      setActionLoading((prev) => ({ ...prev, cancel: false }));
    }
  };

  const handleSettleAuction = async () => {
    if (!listing) return;
    setActionLoading((prev) => ({ ...prev, settle: true }));
    try {
      toast.loading('Settling auction...', { id: 'settle' });
      const result = await marketplace.settleAuction(listing.listingId);
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
        { id: 'settle', duration: 6000 }
      );
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Settle failed:', err);
      toast.error(err.reason || 'Failed to settle auction', { id: 'settle' });
    } finally {
      setActionLoading((prev) => ({ ...prev, settle: false }));
    }
  };

  const handleUpdatePrice = async () => {
    if (!listing || !editPrice) return;
    setActionLoading((prev) => ({ ...prev, editPrice: true }));
    try {
      toast.loading('Updating price...', { id: 'editPrice' });
      await marketplace.updateListingPrice(listing.listingId, editPrice);
      toast.success('Price updated successfully!', { id: 'editPrice' });
      setShowEditPrice(false);
      setEditPrice('');
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Update price failed:', err);
      toast.error(err.reason || 'Failed to update price', { id: 'editPrice' });
    } finally {
      setActionLoading((prev) => ({ ...prev, editPrice: false }));
    }
  };

  // ── FIX: Accept 5 args matching CreateListing callback signature ──
  // CreateListing calls: onCreateListing(tokenId, price, true, reservePrice, duration)
  const handleCreateListing = async (id, price, isAuctionType, reservePrice, duration) => {
    setActionLoading((prev) => ({ ...prev, list: true }));
    try {
      toast.loading('Approving marketplace...', { id: 'approve' });
      await contract.approveMarketplace(id);
      toast.success('Marketplace approved', { id: 'approve' });

      if (isAuctionType) {
        toast.loading('Creating auction...', { id: 'listing' });
        // createAuction expects: (tokenId, startPriceEth, reservePriceEth, durationSec)
        await marketplace.createAuction(id, price, reservePrice || '0', duration);
        toast.success('Auction created!', { id: 'listing' });
      } else {
        toast.loading('Creating listing...', { id: 'listing' });
        await marketplace.createListing(id, price);
        toast.success('Listed for sale!', { id: 'listing' });
      }
      setShowListingModal(false);
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Listing failed:', err);
      toast.error(err.reason || 'Failed to create listing', { id: 'listing' });
      toast.dismiss('approve');
    } finally {
      setActionLoading((prev) => ({ ...prev, list: false }));
    }
  };

  const handleTransfer = async (id, recipientAddress) => {
    setActionLoading((prev) => ({ ...prev, transfer: true }));
    try {
      toast.loading('Transferring NFT...', { id: 'transfer' });
      await contract.transferNFT(account, recipientAddress, id);
      toast.success('NFT transferred!', { id: 'transfer' });
      setShowTransferModal(false);
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Transfer failed:', err);
      toast.error(err.reason || 'Failed to transfer', { id: 'transfer' });
    } finally {
      setActionLoading((prev) => ({ ...prev, transfer: false }));
    }
  };

  const handleBurn = async (id) => {
    setActionLoading((prev) => ({ ...prev, burn: true }));
    try {
      toast.loading('Burning NFT...', { id: 'burn' });
      await contract.burnNFT(id);

      // Clear stale backend caches so a hard refresh won't resurrect burned tokens.
      try {
        await Promise.allSettled([
          fetchApi('/api/nfts/cache/clear', { method: 'POST' }, { expectJson: true }),
          fetchApi('/api/history/cache/clear', { method: 'POST' }, { expectJson: true }),
        ]);
      } catch (cacheErr) {
        console.warn('Failed to clear backend cache after burn:', cacheErr);
      }

      toast.success('NFT burned!', { id: 'burn' });
      favorites?.pruneFavorites([id]);
      setShowBurnModal(false);
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
      navigate('/my-nfts');
    } catch (err) {
      console.error('Burn failed:', err);
      toast.error(err.reason || 'Failed to burn', { id: 'burn' });
    } finally {
      setActionLoading((prev) => ({ ...prev, burn: false }));
    }
  };

  const handleMakeOffer = async (id, amount, durationHours) => {
    setActionLoading((prev) => ({ ...prev, offer: true }));
    try {
      toast.loading('Submitting offer...', { id: 'offer' });
      await marketplace.makeOffer(id, amount, durationHours);
      toast.success('Offer submitted!', { id: 'offer' });
      setShowOfferModal(false);
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Offer failed:', err);
      toast.error(err.reason || 'Failed to make offer', { id: 'offer' });
    } finally {
      setActionLoading((prev) => ({ ...prev, offer: false }));
    }
  };

  const handleAcceptOffer = async (offerId) => {
    setActionLoading((prev) => ({ ...prev, [`accept-${offerId}`]: true }));
    try {
      toast.loading('Approving marketplace...', { id: 'approve-accept' });
      await contract.approveMarketplace(tokenId);
      toast.success('Approved', { id: 'approve-accept' });

      toast.loading('Accepting offer...', { id: 'accept' });
      await marketplace.acceptOffer(offerId);
      toast.success('Offer accepted!', { id: 'accept' });
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Accept failed:', err);
      toast.error(err.reason || 'Failed to accept offer', { id: 'accept' });
      toast.dismiss('approve-accept');
    } finally {
      setActionLoading((prev) => ({ ...prev, [`accept-${offerId}`]: false }));
    }
  };

  const handleDeclineOffer = async (offerId) => {
    setActionLoading((prev) => ({ ...prev, [`decline-offer-${offerId}`]: true }));
    try {
      toast.loading('Declining offer & refunding buyer...', { id: 'decline-offer' });
      await marketplace.declineOffer(offerId);
      toast.success('Offer declined! Buyer\'s ETH has been refunded.', { id: 'decline-offer', icon: '🚫' });
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Decline offer failed:', err);
      toast.error(err.reason || 'Failed to decline offer', { id: 'decline-offer' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`decline-offer-${offerId}`]: false }));
    }
  };

  const handleCancelOffer = async (offerId) => {
    setActionLoading((prev) => ({ ...prev, [`cancel-offer-${offerId}`]: true }));
    try {
      toast.loading('Cancelling offer...', { id: 'cancel-offer' });
      await marketplace.cancelOffer(offerId);
      toast.success('Offer cancelled!', { id: 'cancel-offer' });
      fetchNFTData({ force: true });
    } catch (err) {
      console.error('Cancel offer failed:', err);
      toast.error(err.reason || 'Failed to cancel offer', { id: 'cancel-offer' });
    } finally {
      setActionLoading((prev) => ({ ...prev, [`cancel-offer-${offerId}`]: false }));
    }
  };

  const handleRefreshMetadata = async () => {
    setActionLoading((prev) => ({ ...prev, refresh: true }));
    try {
      toast.loading('Refreshing metadata...', { id: 'refresh' });
      await fetchApi(`/api/ipfs/refresh/${tokenId}`, {}, { expectJson: true });
      await fetchNFTData({ force: true });
      toast.success('Metadata refreshed!', { id: 'refresh' });
    } catch (err) {
      console.error('Refresh failed:', err);
      toast.error('Failed to refresh metadata', { id: 'refresh' });
    } finally {
      setActionLoading((prev) => ({ ...prev, refresh: false }));
    }
  };

  const handleShareLink = () => {
    const url = window.location.href;
    copyToClipboard(url);
    toast.success('Link copied to clipboard!');
  };

  // Loading skeleton — FIX: removed min-h-screen
  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="h-8 w-24 bg-white/10 rounded-lg mb-8 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-square bg-white/5 rounded-2xl animate-pulse" />
            <div className="space-y-4">
              <div className="h-10 bg-white/10 rounded-lg w-3/4 animate-pulse" />
              <div className="h-6 bg-white/10 rounded-lg w-1/4 animate-pulse" />
              <div className="h-20 bg-white/10 rounded-lg animate-pulse" />
              <div className="h-6 bg-white/10 rounded-lg w-1/2 animate-pulse" />
              <div className="h-6 bg-white/10 rounded-lg w-1/2 animate-pulse" />
              <div className="grid grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-16 bg-white/10 rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-12 bg-white/10 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!nft) {
    return (
      <div className="flex items-center justify-center p-6" style={{ minHeight: 'calc(100vh - 4rem)' }}>
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">NFT Not Found</h2>
          <p className="text-gray-400 mb-6">Token #{tokenId} does not exist or has been burned</p>
          <button
            onClick={() => navigate(-1)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const imageUrl = resolveIpfsUrl(nft.imageUrl || nft.image);

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column — Image */}
          <div className="space-y-4">
            <div
              className={`relative rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 cursor-pointer transition-transform duration-300 ${imageZoomed ? 'scale-105' : ''}`}
              onClick={() => setImageZoomed(!imageZoomed)}
            >
              <img
                src={imageUrl}
                alt={nft.name}
                className="w-full aspect-square object-cover"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiMxNDE0MjgiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCIgZm9udC1zaXplPSIxNiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                }}
              />
              <div className="absolute top-3 right-3 flex gap-2">
                <span className="px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-xs text-white font-mono">
                  #{nft.tokenId}
                </span>
              </div>
            </div>

            {/* Action Buttons under image */}
            <div className="flex gap-3">
              <button
                onClick={() => favorites.toggleFavorite(nft.tokenId)}
                className="flex-1 flex items-center justify-center gap-2 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white hover:bg-white/10 transition-colors"
              >
                {favorites.isFavorite(nft.tokenId) ? (
                  <svg className="w-5 h-5 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
                <span className="text-sm font-medium">
                  {favorites.isFavorite(nft.tokenId) ? 'Favorited' : 'Favorite'}
                </span>
              </button>
              <button
                onClick={handleShareLink}
                className="flex-1 flex items-center justify-center gap-2 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="text-sm font-medium">Share</span>
              </button>
              <button
                onClick={handleRefreshMetadata}
                disabled={actionLoading.refresh}
                className="flex-1 flex items-center justify-center gap-2 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <svg className={`w-5 h-5 ${actionLoading.refresh ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm font-medium">Refresh</span>
              </button>
            </div>
          </div>

          {/* Right Column — Details */}
          <div className="space-y-6">
            {/* Name and Token ID */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-white">{nft.name}</h1>
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 font-mono">
                  #{nft.tokenId}
                </span>
              </div>
            </div>

            {/* Owner */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Owner</p>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/profile/${nft.owner}`}
                      className="text-purple-400 hover:text-purple-300 font-mono text-sm transition-colors"
                    >
                      {shortenAddress(nft.owner)}
                    </Link>
                    {isOwner && (
                      <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                        You
                      </span>
                    )}
                    <a
                      href={`${ETHERSCAN_BASE}/address/${nft.owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400 mb-1">Creator</p>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/profile/${nft.creator}`}
                      className="text-purple-400 hover:text-purple-300 font-mono text-sm transition-colors"
                    >
                      {shortenAddress(nft.creator)}
                    </Link>
                    {isCreator && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs font-medium">
                        You
                      </span>
                    )}
                    <a
                      href={`${ETHERSCAN_BASE}/address/${nft.creator}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>

              {/* Royalty */}
              {nft.royaltyBps > 0 && (
                <div className="pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Royalty:</span>
                    <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                      {(nft.royaltyBps / 100).toFixed(1)}%
                    </span>
                    {nft.royaltyReceiver && (
                      <a
                        href={`${ETHERSCAN_BASE}/address/${nft.royaltyReceiver}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-gray-300 text-xs font-mono transition-colors"
                      >
                        → {shortenAddress(nft.royaltyReceiver)}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            {nft.description && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
                <p className="text-gray-300 leading-relaxed">{nft.description}</p>
              </div>
            )}

            {/* Attributes */}
            {nft.attributes && nft.attributes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">Attributes</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {nft.attributes.map((attr, idx) => {
                    const rarityKey = `${attr.trait_type}:::${attr.value}`;
                    const pct = traitRarity[rarityKey];
                    return (
                      <div
                        key={idx}
                        className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-3 text-center hover:border-purple-500/30 transition-colors"
                      >
                        <p className="text-xs text-purple-400 font-medium uppercase tracking-wider mb-1">
                          {attr.trait_type}
                        </p>
                        <p className="text-sm text-white font-semibold truncate">{attr.value}</p>
                        {pct !== undefined && (
                          <p className="text-xs text-gray-500 mt-1">
                            {pct}% have this
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Listing Section — Fixed Price */}
            {isFixedPrice && (
              <div className="backdrop-blur-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Listed Price</p>
                    <p className="text-3xl font-bold text-white">{formatEth(listing.price)} ETH</p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-medium">
                    For Sale
                  </span>
                </div>
                <div className="flex gap-3">
                  {!isSeller && account && (
                    <button
                      onClick={handleBuyNow}
                      disabled={actionLoading.buy}
                      className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {actionLoading.buy ? (
                        <>
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Processing...
                        </>
                      ) : (
                        'Buy Now'
                      )}
                    </button>
                  )}
                  {isSeller && (
                    <>
                      <button
                        onClick={handleCancelListing}
                        disabled={actionLoading.cancel}
                        className="flex-1 backdrop-blur-xl bg-white/5 border border-white/10 text-white rounded-xl px-6 py-3 font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                      >
                        {actionLoading.cancel ? 'Cancelling...' : 'Cancel Listing'}
                      </button>
                      <button
                        onClick={() => {
                          setEditPrice(formatEth(listing.price));
                          setShowEditPrice(!showEditPrice);
                        }}
                        className="backdrop-blur-xl bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 font-semibold hover:bg-white/10 transition-colors"
                      >
                        Edit Price
                      </button>
                    </>
                  )}
                </div>
                {/* Inline Edit Price */}
                {showEditPrice && isSeller && (
                  <div className="mt-4 flex gap-3">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="New price in ETH"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={handleUpdatePrice}
                      disabled={actionLoading.editPrice || !editPrice}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {actionLoading.editPrice ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Listing Section — Auction */}
            {isAuction && (
              <div className="backdrop-blur-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    {/* FIX: ethers.formatEther(0n) returns '0.0' not '0', so string
                         comparison '0.0' !== '0' was always true — use parseFloat > 0 */}
                    <p className="text-sm text-gray-400 mb-1">
                      {parseFloat(listing.highestBid) > 0 ? 'Current Bid' : 'Starting Price'}
                    </p>
                    <p className="text-3xl font-bold text-white">
                      {parseFloat(listing.highestBid) > 0
                        ? formatEth(listing.highestBid)
                        : formatEth(listing.startPrice || listing.price)}{' '}
                      ETH
                    </p>
                  </div>
                  <div className="text-right">
                    {!auctionEnded ? (
                      <>
                        <p className="text-sm text-gray-400 mb-1">Time Remaining</p>
                        <p className="text-lg font-bold text-orange-400">
                          {/* FIX: was listing.endTime (undefined) → NaN → "NaNm" */}
                          {formatTimeRemaining(listing.auctionEndTime)}
                        </p>
                      </>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 text-sm font-medium">
                        Auction Ended
                      </span>
                    )}
                  </div>
                </div>

                {listing.highestBidder && listing.highestBidder !== '0x0000000000000000000000000000000000000000' && (
                  <p className="text-sm text-gray-400 mb-4">
                    Highest bidder:{' '}
                    <Link to={`/profile/${listing.highestBidder}`} className="text-purple-400 hover:text-purple-300">
                      {shortenAddress(listing.highestBidder)}
                    </Link>
                  </p>
                )}

                <div className="flex gap-3">
                  {!auctionEnded && !isSeller && account && (
                    <div className="flex-1 flex gap-3">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder="Bid amount in ETH"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <button
                        onClick={handlePlaceBid}
                        disabled={actionLoading.bid || !bidAmount}
                        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {actionLoading.bid ? 'Bidding...' : 'Place Bid'}
                      </button>
                    </div>
                  )}
                  {auctionEnded && (
                    <button
                      onClick={handleSettleAuction}
                      disabled={actionLoading.settle}
                      className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {actionLoading.settle ? 'Settling...' : 'Settle Auction'}
                    </button>
                  )}
                  {isSeller && !auctionEnded && (
                    <button
                      onClick={handleCancelListing}
                      disabled={actionLoading.cancel}
                      className="backdrop-blur-xl bg-white/5 border border-white/10 text-white rounded-xl px-6 py-3 font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {actionLoading.cancel ? 'Cancelling...' : 'Cancel Auction'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Owner Actions — Not Listed */}
            {isOwner && !listing && (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowListingModal(true)}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
                >
                  List for Sale
                </button>
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="flex-1 backdrop-blur-xl bg-white/5 border border-white/10 text-white rounded-xl px-6 py-3 font-semibold hover:bg-white/10 transition-colors"
                >
                  Transfer
                </button>
                <button
                  onClick={() => setShowBurnModal(true)}
                  className="backdrop-blur-xl bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-6 py-3 font-semibold hover:bg-red-500/20 transition-colors"
                >
                  Burn
                </button>
              </div>
            )}

            {/* Make Offer — Not owner, not listed */}
            {!isOwner && !listing && account && (
              <button
                onClick={() => setShowOfferModal(true)}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
              >
                Make Offer
              </button>
            )}

            {/* Etherscan Links */}
            <div className="flex gap-3 pt-2">
              <a
                href={`${ETHERSCAN_BASE}/token/${CONTRACT_ADDRESS}?a=${tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-purple-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Etherscan
              </a>
              <a
                href={`${ETHERSCAN_BASE}/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-purple-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Contract
              </a>
            </div>
          </div>
        </div>

        {/* Offers Section */}
        {offers.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
              Offers
              <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-sm font-medium">
                {offers.length}
              </span>
            </h2>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Buyer</th>
                    <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Amount</th>
                    <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Expires</th>
                    <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((offer) => {
                    const isBuyer = account && offer.buyer.toLowerCase() === account.toLowerCase();
                    return (
                      <tr key={offer.offerId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <Link
                            to={`/profile/${offer.buyer}`}
                            className="text-purple-400 hover:text-purple-300 font-mono text-sm transition-colors"
                          >
                            {shortenAddress(offer.buyer)}
                          </Link>
                          {isBuyer && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                              You
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-white font-semibold">{formatEth(offer.amount)} ETH</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-gray-400 text-sm">{formatTimeRemaining(offer.expiresAt)}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isOwner && (
                              <>
                                <button
                                  onClick={() => handleAcceptOffer(offer.offerId)}
                                  disabled={actionLoading[`accept-${offer.offerId}`]}
                                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                  {actionLoading[`accept-${offer.offerId}`] ? 'Accepting...' : 'Accept'}
                                </button>
                                <button
                                  onClick={() => handleDeclineOffer(offer.offerId)}
                                  disabled={actionLoading[`decline-offer-${offer.offerId}`]}
                                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-rose-500 text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                  {actionLoading[`decline-offer-${offer.offerId}`] ? 'Declining...' : 'Decline'}
                                </button>
                              </>
                            )}
                            {isBuyer && (
                              <button
                                onClick={() => handleCancelOffer(offer.offerId)}
                                disabled={actionLoading[`cancel-offer-${offer.offerId}`]}
                                className="px-4 py-2 backdrop-blur-xl bg-white/5 border border-white/10 text-white rounded-lg text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-50"
                              >
                                {actionLoading[`cancel-offer-${offer.offerId}`] ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Price History Chart ──────────────────────────────────────── */}
        {priceHistory.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Price History
            </h2>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={priceHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#ffffff20"
                    tick={{ fill: '#ffffff60', fontSize: 12 }}
                    axisLine={{ stroke: '#ffffff10' }}
                  />
                  <YAxis
                    stroke="#ffffff20"
                    tick={{ fill: '#ffffff60', fontSize: 12 }}
                    axisLine={{ stroke: '#ffffff10' }}
                    tickFormatter={(val) => `${val} ETH`}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a2e',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                    formatter={(value) => [`${value} ETH`, 'Price']}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fill="url(#priceGradient)"
                    dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#a78bfa' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ─── Activity History ─────────────────────────────────────────── */}
        {activityEvents.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              Activity
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-sm font-medium">
                {activityEvents.length}
              </span>
            </h2>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Event</th>
                    <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">Price</th>
                    <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">From</th>
                    <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">To</th>
                    <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {activityEvents.map((ev, idx) => {
                    const eventConfig = {
                      Mint:     { icon: '🎨', color: 'text-green-400',  bg: 'bg-green-500/10' },
                      Burn:     { icon: '🔥', color: 'text-red-400',    bg: 'bg-red-500/10' },
                      Transfer: { icon: '🔄', color: 'text-blue-400',   bg: 'bg-blue-500/10' },
                      Listing:  { icon: '📋', color: 'text-purple-400', bg: 'bg-purple-500/10' },
                      Auction:  { icon: '⏰', color: 'text-orange-400', bg: 'bg-orange-500/10' },
                      Sale:     { icon: '🛒', color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
                      Bid:      { icon: '💰', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                    };
                    const cfg = eventConfig[ev.type] || eventConfig.Transfer;
                    const timeAgo = (() => {
                      const seconds = Math.floor(Date.now() / 1000 - ev.timestamp);
                      if (seconds < 60) return `${seconds}s ago`;
                      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
                      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
                      return `${Math.floor(seconds / 86400)}d ago`;
                    })();

                    return (
                      <tr key={`${ev.txHash}-${idx}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center text-sm`}>
                              {cfg.icon}
                            </span>
                            <span className={`font-semibold text-sm ${cfg.color}`}>{ev.type}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {ev.price ? (
                            <span className="text-white font-semibold">{formatEth(ev.price)} ETH</span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {ev.type === 'Mint' ? (
                            <span className="text-gray-500 text-sm">Mint</span>
                          ) : (
                            renderActivityAddress(ev.from)
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {ev.type === 'Burn' ? (
                            <span className="text-gray-500 text-sm">Burn</span>
                          ) : (
                            renderActivityAddress(ev.to)
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <a
                            href={`${ETHERSCAN_BASE}/tx/${ev.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-white text-sm transition-colors"
                            title={new Date(ev.timestamp * 1000).toLocaleString()}
                          >
                            {timeAgo}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showListingModal && (
        <CreateListing
          isOpen={showListingModal}
          onClose={() => setShowListingModal(false)}
          tokenId={nft.tokenId}
          tokenName={nft.name}
          onCreateListing={handleCreateListing}
          loading={actionLoading.list || marketplace.loading}
        />
      )}

      {showTransferModal && (
        <TransferNFT
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          tokenId={nft.tokenId}
          tokenName={nft.name}
          onTransfer={handleTransfer}
          loading={actionLoading.transfer || contract.loading}
        />
      )}

      {showBurnModal && (
        <BurnConfirmation
          isOpen={showBurnModal}
          onClose={() => setShowBurnModal(false)}
          tokenId={nft.tokenId}
          tokenName={nft.name}
          onBurn={handleBurn}
          loading={actionLoading.burn || contract.loading}
        />
      )}

      {showOfferModal && (
        <MakeOffer
          isOpen={showOfferModal}
          onClose={() => setShowOfferModal(false)}
          tokenId={nft.tokenId}
          tokenName={nft.name}
          onMakeOffer={handleMakeOffer}
          loading={actionLoading.offer || marketplace.loading}
        />
      )}
    </div>
  );
};

export default NFTDetail;
