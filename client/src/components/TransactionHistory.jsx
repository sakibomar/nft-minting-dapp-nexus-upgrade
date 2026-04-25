/**
 * @file TransactionHistory.jsx
 * @description Displays on-chain transaction history for the NFT collection.
 *
 * Shows ALL blockchain events including ERC-721 transfers AND marketplace events:
 * mint, transfer, burn, approval, listed, sale, bid, bid_refund, auction_settled,
 * listing_cancelled, price_updated, offer_made, offer_accepted, offer_cancelled,
 * offer_declined, approval_all.
 *
 * Features:
 *   - Event type filter tabs (scrollable)
 *   - Wallet address filter
 *   - Token ID filter
 *   - Search by address/txHash
 *   - Clean table layout (Type, Token ID, From, To, Value, Tx Hash, Time)
 *
 * FIX APPLIED:
 *   - Added AbortController with 20s timeout so fetch never hangs forever
 *   - Previous in-flight requests are cancelled when a new fetch starts
 *   - Timeout shows a user-friendly error with Retry button
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { shortenAddress, formatEth, formatDate, getEtherscanUrl } from '../utils/helpers';
import { fetchApiJson } from '../utils/api';

const TransactionHistory = ({ refreshKey, forceNonce }) => {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addressFilter, setAddressFilter] = useState('');
  const [tokenIdFilter, setTokenIdFilter] = useState('');
  const tabsRef = useRef(null);
  const abortRef = useRef(null);

  const filters = [
    { key: 'all', label: 'All', icon: '📋' },
    { key: 'mint', label: 'Mints', icon: '✨' },
    { key: 'transfer', label: 'Transfers', icon: '📤' },
    { key: 'burn', label: 'Burns', icon: '🔥' },
    { key: 'approval', label: 'Approvals', icon: '✅' },
    { key: 'listed', label: 'Listings', icon: '🏷️' },
    { key: 'sale', label: 'Sales', icon: '💰' },
    { key: 'bid', label: 'Bids', icon: '🔨' },
    { key: 'auction_settled', label: 'Auctions', icon: '⚡' },
    { key: 'listing_cancelled', label: 'Cancelled', icon: '❌' },
    { key: 'offer_made', label: 'Offers', icon: '💌' },
    { key: 'offer_accepted', label: 'Accepted', icon: '🤝' },
    { key: 'offer_cancelled', label: 'Offer Cancel', icon: '🚫' },
    { key: 'offer_declined', label: 'Declined', icon: '👎' },
    { key: 'price_updated', label: 'Price Update', icon: '📊' },
  ];

  // Build query params for server-side filtering
  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (addressFilter.trim()) params.set('address', addressFilter.trim());
    if (tokenIdFilter.trim()) params.set('tokenId', tokenIdFilter.trim());
    if (activeFilter !== 'all') params.set('type', activeFilter);
    return params.toString();
  }, [addressFilter, tokenIdFilter, activeFilter]);

  // Fetch from server — with AbortController timeout to prevent infinite hang
  const fetchHistory = useCallback(async ({ force = false } = {}) => {
    // Cancel any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    // 20-second timeout — if server hasn't responded by then, abort
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams(buildQueryParams());
      if (force) params.set('force', '1');
      const queryStr = params.toString();
      const url = `/api/history${queryStr ? `?${queryStr}` : ''}`;
      const { res, data } = await fetchApiJson(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch transaction history');
      const events = Array.isArray(data) ? data : data.events || [];
      setTransactions(events);
    } catch (err) {
      clearTimeout(timeoutId);
      // AbortError means either timeout or a newer request replaced this one
      if (err.name === 'AbortError') {
        // Only set error if this is still the active request (timeout, not replacement)
        if (abortRef.current === controller) {
          setError('Request timed out — the server may be busy. Click Retry to try again.');
        }
        return; // Don't clear loading for replaced requests
      }
      console.error('Error fetching history:', err);
      setError(err.message);
    } finally {
      clearTimeout(timeoutId);
      // Only update loading state if this is still the active request
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [buildQueryParams]);

  // Fetch on mount and when server-side filters change
  useEffect(() => {
    fetchHistory({ force: false });
  }, [fetchHistory, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) {
      fetchHistory({ force: true });
    }
  }, [fetchHistory, forceNonce]);

  // Cleanup: abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Client-side search filtering (search within already fetched results)
  useEffect(() => {
    let filtered = [...transactions];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (tx) =>
          tx.from?.toLowerCase().includes(query) ||
          tx.to?.toLowerCase().includes(query) ||
          tx.tokenId?.toString().includes(query) ||
          tx.txHash?.toLowerCase().includes(query) ||
          tx.listingId?.toString().includes(query) ||
          tx.offerId?.toString().includes(query)
      );
    }

    setFilteredTransactions(filtered);
  }, [transactions, searchQuery]);

  const getTypeBadge = (eventType) => {
    const type = eventType?.toLowerCase();
    const badges = {
      mint: { bg: 'bg-green-500/10', text: 'text-green-400', icon: '✨', label: 'Mint' },
      transfer: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '📤', label: 'Transfer' },
      burn: { bg: 'bg-red-500/10', text: 'text-red-400', icon: '🔥', label: 'Burn' },
      approval: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: '✅', label: 'Approval' },
      approval_all: { bg: 'bg-teal-500/10', text: 'text-teal-400', icon: '✅', label: 'Approve All' },
      listed: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: '🏷️', label: 'Listed' },
      sale: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: '💰', label: 'Sale' },
      bid: { bg: 'bg-orange-500/10', text: 'text-orange-400', icon: '🔨', label: 'Bid' },
      bid_refund: { bg: 'bg-orange-400/10', text: 'text-orange-300', icon: '↩️', label: 'Bid Refund' },
      auction_settled: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', icon: '⚡', label: 'Auction Won' },
      listing_cancelled: { bg: 'bg-gray-500/10', text: 'text-gray-400', icon: '❌', label: 'Cancelled' },
      price_updated: { bg: 'bg-sky-500/10', text: 'text-sky-400', icon: '📊', label: 'Price Update' },
      offer_made: { bg: 'bg-pink-500/10', text: 'text-pink-400', icon: '💌', label: 'Offer Made' },
      offer_accepted: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '🤝', label: 'Offer Accepted' },
      offer_cancelled: { bg: 'bg-rose-500/10', text: 'text-rose-400', icon: '🚫', label: 'Offer Cancelled' },
      offer_declined: { bg: 'bg-slate-500/10', text: 'text-slate-400', icon: '👎', label: 'Offer Declined' },
    };

    const badge = badges[type];
    if (badge) {
      return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg ${badge.bg} ${badge.text} text-xs font-semibold`}>
          <span className="mr-1">{badge.icon}</span> {badge.label}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-gray-500/10 text-gray-400 text-xs font-semibold">
        {eventType || 'Unknown'}
      </span>
    );
  };

  // Count events by type for badge
  const getCount = (key) => {
    if (key === 'all') return transactions.length;
    return transactions.filter((tx) => tx.eventType?.toLowerCase() === key).length;
  };

  // Handle horizontal scroll on tabs with mouse wheel
  const handleTabsWheel = (e) => {
    if (tabsRef.current) {
      e.preventDefault();
      tabsRef.current.scrollLeft += e.deltaY;
    }
  };

  // ── Loading state ───────────────────────────────────────────────────
  // Only show full skeleton on the FIRST load (no data yet).
  // On subsequent fetches (navigating back), show stale data with a subtle
  // refresh indicator so the page never flashes blank.
  const isFirstLoad = loading && transactions.length === 0;

  if (isFirstLoad) {
    return (
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="h-8 w-64 bg-white/10 rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-96 bg-white/5 rounded-lg animate-pulse" />
          </div>

          {/* Filter Skeleton */}
          <div className="bg-nft-card/50 border border-white/5 rounded-2xl p-4 mb-6 space-y-4">
            <div className="flex space-x-3">
              <div className="h-10 flex-1 bg-white/5 rounded-xl animate-pulse" />
              <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse" />
            </div>
            <div className="flex space-x-2 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 w-24 bg-white/5 rounded-xl animate-pulse flex-shrink-0" />
              ))}
            </div>
          </div>

          {/* Table Skeleton */}
          <div className="bg-nft-card/50 border border-white/5 rounded-2xl overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center space-x-4 p-4 border-b border-white/5 animate-pulse"
              >
                <div className="h-6 w-20 bg-white/10 rounded-lg" />
                <div className="h-4 w-12 bg-white/5 rounded" />
                <div className="h-4 w-32 bg-white/5 rounded" />
                <div className="h-4 w-32 bg-white/5 rounded" />
                <div className="h-4 w-16 bg-white/5 rounded" />
                <div className="h-4 w-24 bg-white/5 rounded" />
                <div className="h-4 w-20 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            Transaction{' '}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              History
            </span>
          </h1>
          <p className="text-gray-400">
            Browse all on-chain events for the NFT collection — transfers, marketplace activity, approvals &amp; more.
          </p>
        </div>

        {/* Subtle refresh indicator — only shows when refetching with stale data visible */}
        {loading && transactions.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-full h-1 bg-white/5">
            <div className="h-full w-1/3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
              style={{ animation: 'shimmer 1.5s ease-in-out infinite', }}
            />
            <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }`}</style>
          </div>
        )}

        {/* ── Filter Bar ───────────────────────────────────────────────── */}
        <div className="bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl p-4 mb-6 space-y-4">

          {/* Row 1: Search + Token ID + Address */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search by address/txHash */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by address, txHash, or ID..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Wallet Address Filter */}
            <div className="relative sm:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">👤</span>
              <input
                type="text"
                value={addressFilter}
                onChange={(e) => setAddressFilter(e.target.value)}
                placeholder="Filter by wallet address..."
                className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all duration-200 font-mono"
              />
              {addressFilter && (
                <button
                  onClick={() => setAddressFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Token ID Filter */}
            <div className="relative sm:w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">#</span>
              <input
                type="text"
                value={tokenIdFilter}
                onChange={(e) => setTokenIdFilter(e.target.value)}
                placeholder="Token ID"
                className="w-full pl-8 pr-10 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all duration-200 font-mono"
              />
              {tokenIdFilter && (
                <button
                  onClick={() => setTokenIdFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Event Type Tabs (scrollable) + Mobile Dropdown */}
          <div className="flex items-center gap-3">
            {/* Mobile event type dropdown */}
            <div className="sm:hidden flex-shrink-0 w-full">
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer"
              >
                {filters.map((f) => (
                  <option key={f.key} value={f.key} className="bg-gray-900 text-white">
                    {f.icon} {f.label} ({getCount(f.key)})
                  </option>
                ))}
              </select>
            </div>

            {/* Desktop scrollable tabs */}
            <div
              ref={tabsRef}
              onWheel={handleTabsWheel}
              className="hidden sm:flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent flex-1"
            >
              {filters.map((filter) => {
                const count = getCount(filter.key);
                return (
                  <button
                    key={filter.key}
                    onClick={() => setActiveFilter(filter.key)}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                      activeFilter === filter.key
                        ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30 shadow-lg shadow-purple-500/5'
                        : 'bg-white/5 text-gray-400 border border-white/5 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{filter.icon}</span>
                    <span>{filter.label}</span>
                    {count > 0 && (
                      <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] ${
                        activeFilter === filter.key ? 'bg-white/10' : 'bg-white/5'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center mb-6">
            <p className="text-red-400 font-medium">{error}</p>
            <button
              onClick={() => fetchHistory({ force: true })}
              className="mt-3 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all duration-200 text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!error && filteredTransactions.length === 0 && (
          <div className="bg-nft-card/50 border border-white/5 rounded-2xl p-16 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No Events Found</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              {searchQuery || addressFilter || tokenIdFilter || activeFilter !== 'all'
                ? 'No events match your current filters. Try adjusting your search criteria.'
                : 'There are no events to display yet. Start by minting your first NFT!'}
            </p>
            {(searchQuery || addressFilter || tokenIdFilter || activeFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setAddressFilter('');
                  setTokenIdFilter('');
                  setActiveFilter('all');
                }}
                className="mt-4 px-4 py-2 rounded-xl bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-all duration-200 text-sm"
              >
                Clear All Filters
              </button>
            )}
          </div>
        )}

        {/* Desktop Table */}
        {!error && filteredTransactions.length > 0 && (
          <>
            <div className="hidden lg:block bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Token ID
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        From
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        To
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Value
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Tx Hash
                      </th>
                      <th className="px-5 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredTransactions.map((tx, index) => (
                      <tr
                        key={tx.txHash ? `${tx.txHash}-${tx.eventType}-${index}` : index}
                        className="hover:bg-white/[0.02] transition-colors duration-150"
                      >
                        <td className="px-5 py-4 whitespace-nowrap">
                          {getTypeBadge(tx.eventType)}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {tx.tokenId != null ? (
                            <Link
                              to={`/nft/${tx.tokenId}`}
                              className="text-purple-400 hover:text-purple-300 font-medium text-sm transition-colors"
                            >
                              #{tx.tokenId}
                            </Link>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {tx.from ? (
                            <Link
                              to={`/profile/${tx.from}`}
                              className="text-gray-300 hover:text-white font-mono text-sm transition-colors"
                            >
                              {shortenAddress(tx.from)}
                            </Link>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {tx.to ? (
                            <Link
                              to={`/profile/${tx.to}`}
                              className="text-gray-300 hover:text-white font-mono text-sm transition-colors"
                            >
                              {shortenAddress(tx.to)}
                            </Link>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {tx.value && parseFloat(tx.value) > 0 ? (
                            <span className="text-white text-sm font-medium">
                              {formatEth(tx.value)} ETH
                            </span>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {tx.txHash ? (
                            <a
                              href={getEtherscanUrl('tx', tx.txHash)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-purple-400 hover:text-purple-300 font-mono text-sm transition-colors"
                            >
                              <span>{shortenAddress(tx.txHash)}</span>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-gray-600 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="text-gray-400 text-sm">
                            {tx.timestamp ? formatDate(tx.timestamp) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {filteredTransactions.map((tx, index) => (
                <div
                  key={tx.txHash ? `${tx.txHash}-${tx.eventType}-${index}` : index}
                  className="bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-3">
                    {getTypeBadge(tx.eventType)}
                    {tx.tokenId != null ? (
                      <Link
                        to={`/nft/${tx.tokenId}`}
                        className="text-purple-400 hover:text-purple-300 font-semibold text-sm"
                      >
                        #{tx.tokenId}
                      </Link>
                    ) : (
                      <span className="text-gray-600 text-sm">—</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {tx.from && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">From</span>
                        <Link
                          to={`/profile/${tx.from}`}
                          className="text-gray-300 hover:text-white font-mono text-xs"
                        >
                          {shortenAddress(tx.from)}
                        </Link>
                      </div>
                    )}
                    {tx.to && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">To</span>
                        <Link
                          to={`/profile/${tx.to}`}
                          className="text-gray-300 hover:text-white font-mono text-xs"
                        >
                          {shortenAddress(tx.to)}
                        </Link>
                      </div>
                    )}
                    {tx.value && parseFloat(tx.value) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">Value</span>
                        <span className="text-white text-xs font-medium">
                          {formatEth(tx.value)} ETH
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 text-xs">Time</span>
                      <span className="text-gray-400 text-xs">
                        {tx.timestamp ? formatDate(tx.timestamp) : '—'}
                      </span>
                    </div>
                  </div>

                  {tx.txHash && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <a
                        href={getEtherscanUrl('tx', tx.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1.5 text-purple-400 hover:text-purple-300 text-xs transition-colors"
                      >
                        <span className="font-mono">{shortenAddress(tx.txHash)}</span>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Results Count */}
            <div className="mt-6 text-center text-gray-500 text-sm">
              Showing {filteredTransactions.length} of {transactions.length} events
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TransactionHistory;
