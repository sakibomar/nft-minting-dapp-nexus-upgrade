import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import NFTCard from './NFTCard';
import { shortenAddress, resolveIpfsUrl } from '../utils/helpers';
import { fetchApiJson } from '../utils/api';

const ITEMS_PER_PAGE = 12;

// ─── Icons (inline SVG components) ──────────────────────────────────────────

const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const GridIcon = ({ active }) => (
  <svg className={`w-5 h-5 ${active ? 'text-purple-400' : 'text-white/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const ListIcon = ({ active }) => (
  <svg className={`w-5 h-5 ${active ? 'text-purple-400' : 'text-white/40'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

const ChevronDownIcon = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const FilterIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const XIcon = ({ className }) => (
  <svg className={className || 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const HeartIcon = ({ filled }) =>
  filled ? (
    <svg className="w-4 h-4 text-red-500 fill-current" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );

// ─── Skeleton Loader ────────────────────────────────────────────────────────

const SkeletonCard = () => (
  <div className="rounded-2xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 animate-pulse">
    <div className="aspect-square bg-white/5" />
    <div className="p-4 space-y-3">
      <div className="h-5 bg-white/10 rounded-lg w-3/4" />
      <div className="h-4 bg-white/5 rounded-lg w-1/2" />
      <div className="flex gap-2">
        <div className="h-5 bg-white/5 rounded-lg w-16" />
        <div className="h-5 bg-white/5 rounded-lg w-20" />
      </div>
      <div className="h-4 bg-white/5 rounded-lg w-1/3 mt-2" />
    </div>
  </div>
);

const SkeletonRow = () => (
  <div className="flex items-center gap-4 p-3 animate-pulse">
    <div className="w-12 h-12 rounded-lg bg-white/5 flex-shrink-0" />
    <div className="h-4 bg-white/10 rounded w-12" />
    <div className="h-4 bg-white/10 rounded w-32 flex-1" />
    <div className="h-4 bg-white/5 rounded w-24 hidden md:block" />
    <div className="h-4 bg-white/5 rounded w-24 hidden md:block" />
    <div className="h-4 bg-white/5 rounded w-10 hidden lg:block" />
    <div className="h-4 bg-white/5 rounded w-14 hidden lg:block" />
  </div>
);

// ─── Trait Filter Sidebar ───────────────────────────────────────────────────

const TraitAccordion = ({ traitType, values, activeFilters, onToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = activeFilters.filter((f) => f.trait_type === traitType).length;

  // Sort values by count descending, then alphabetically
  const sortedValues = useMemo(() => {
    return [...values].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [values]);

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white/80 hover:text-white hover:bg-white/5 transition-all duration-200"
      >
        <span className="flex items-center gap-2 truncate">
          <span className="truncate">{traitType}</span>
          {activeCount > 0 && (
            <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 flex-shrink-0 text-white/30 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-3 pb-3 space-y-0.5 max-h-56 overflow-y-auto custom-scrollbar">
          {sortedValues.map(({ value, count }) => {
            const isActive = activeFilters.some(
              (f) => f.trait_type === traitType && f.value === value
            );
            return (
              <label
                key={value}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${
                  isActive ? 'bg-purple-500/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => onToggle(traitType, value)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all duration-150 ${
                    isActive
                      ? 'bg-purple-500 border-purple-500'
                      : 'border-white/20 bg-transparent hover:border-white/40'
                  }`}
                >
                  {isActive && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm truncate flex-1">{value}</span>
                <span className="text-xs text-white/30 flex-shrink-0 tabular-nums">{count}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

const TraitSidebar = ({ traitMap, activeFilters, onToggle, onClearAll, totalFilterCount, sidebarOpen, onCloseSidebar }) => {
  const traitTypes = useMemo(() => {
    return Object.keys(traitMap).sort((a, b) => a.localeCompare(b));
  }, [traitMap]);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onCloseSidebar}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 lg:top-4 left-0 z-50 lg:z-auto h-full lg:h-auto w-[300px] lg:w-[280px] flex-shrink-0 transition-transform duration-300 lg:transition-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-full lg:h-auto overflow-y-auto backdrop-blur-xl bg-[#141428]/95 lg:bg-white/5 border-r lg:border border-white/10 lg:rounded-2xl">
          {/* Sidebar header */}
          <div className="sticky top-0 z-10 backdrop-blur-xl bg-[#141428]/95 lg:bg-white/5 border-b border-white/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FilterIcon />
              <span className="text-white font-bold text-sm">Traits</span>
              {totalFilterCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold">
                  {totalFilterCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {totalFilterCount > 0 && (
                <button
                  onClick={onClearAll}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold transition-colors"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={onCloseSidebar}
                className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Trait accordions */}
          {traitTypes.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/30 text-sm">
              No traits found in collection
            </div>
          ) : (
            traitTypes.map((traitType) => (
              <TraitAccordion
                key={traitType}
                traitType={traitType}
                values={traitMap[traitType]}
                activeFilters={activeFilters}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
};

// ─── List View Row ──────────────────────────────────────────────────────────

const ListViewRow = ({ nft, account, listing, favorites }) => {
  const [imgError, setImgError] = useState(false);
  const royaltyPercent = nft.royaltyBps ? (nft.royaltyBps / 100).toFixed(1) : '0.0';
  const traitCount = (nft.attributes || []).length;

  const resolveImageUrl = () => {
    return resolveIpfsUrl(nft.imageUrl || nft.image);
  };

  const isOwner = account && nft.owner && account.toLowerCase() === nft.owner.toLowerCase();

  return (
    <Link
      to={`/nft/${nft.tokenId}`}
      className="group flex items-center gap-3 md:gap-4 px-3 md:px-4 py-3 hover:bg-white/5 transition-all duration-200 border-b border-white/5 last:border-b-0"
    >
      {/* Thumbnail */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#141428] flex-shrink-0">
        {imgError ? (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        ) : (
          <img
            src={resolveImageUrl()}
            alt={nft.name || `NFT #${nft.tokenId}`}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      {/* Token ID */}
      <span className="text-white/40 text-sm font-mono w-14 flex-shrink-0 tabular-nums">
        #{nft.tokenId}
      </span>

      {/* Name */}
      <span className="text-white font-semibold text-sm truncate flex-1 min-w-0 group-hover:text-purple-300 transition-colors">
        {nft.name || `NFT #${nft.tokenId}`}
      </span>

      {/* Owner */}
      <span className="hidden md:block text-white/40 text-xs font-mono w-28 truncate flex-shrink-0">
        {isOwner ? (
          <span className="text-purple-400 font-semibold">You</span>
        ) : nft.owner ? (
          shortenAddress(nft.owner)
        ) : (
          '—'
        )}
      </span>

      {/* Creator */}
      <span className="hidden md:block text-white/40 text-xs font-mono w-28 truncate flex-shrink-0">
        {nft.creator ? shortenAddress(nft.creator) : '—'}
      </span>

      {/* Price */}
      <span className="hidden lg:block w-24 flex-shrink-0">
        {listing ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
            <svg className="w-3 h-3" viewBox="0 0 320 512" fill="currentColor">
              <path d="M311.9 260.8L160 353.6 8 260.8 160 0l151.9 260.8zM160 383.4L8 290.6 160 512l152-221.4-152 92.8z" />
            </svg>
            {parseFloat(listing.price).toFixed(4)}
          </span>
        ) : (
          <span className="text-xs text-white/20">—</span>
        )}
      </span>

      {/* Traits count */}
      <span className="hidden lg:flex items-center gap-1 text-xs text-white/30 w-14 flex-shrink-0">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        {traitCount}
      </span>

      {/* Royalty */}
      <span className="hidden lg:block text-xs text-white/30 w-16 flex-shrink-0 text-right tabular-nums">
        {royaltyPercent}%
      </span>

      {/* Favorite indicator */}
      <span className="w-6 flex-shrink-0 flex justify-center">
        {favorites && favorites.isFavorite(nft.tokenId) && <HeartIcon filled />}
      </span>
    </Link>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const NFTGallery = ({ account, contract, marketplace, favorites, refreshKey, forceNonce }) => {
  const [nfts, setNfts] = useState([]);
  const [listingMap, setListingMap] = useState({}); // tokenId -> { price, isAuction }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'mine' | 'favorites'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTraitFilters, setActiveTraitFilters] = useState([]); // [{trait_type, value}, ...]
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchInputRef = useRef(null);

  // ── Fetch NFTs ──────────────────────────────────────────────────────────

  const fetchNFTs = useCallback(async ({ force = false } = {}) => {
    setLoading(true);
    setError(null);
    const nftsUrl = `/api/nfts${force ? '?force=1' : ''}`;
    const listingsUrl = `/api/marketplace/listings/active${force ? '?force=1' : ''}`;
    try {
      const [nftResult, listingResult] = await Promise.all([
        fetchApiJson(nftsUrl),
        fetchApiJson(listingsUrl).catch(() => null),
      ]);
      const nftData = nftResult.data;
      if (!nftResult.res.ok) {
        throw new Error(nftData?.error || 'Failed to fetch NFTs');
      }
      if (nftData.success && nftData.nfts) {
        setNfts(nftData.nfts);
        if (favorites) {
          var validIds = new Set(nftData.nfts.map(function (nft) { return String(nft.tokenId); }));
          var staleFavorites = favorites.getFavoritesList().filter(function (tokenId) {
            return !validIds.has(String(tokenId));
          });
          if (staleFavorites.length > 0) {
            favorites.pruneFavorites(staleFavorites);
          }
        }
      } else {
        setError('Failed to fetch NFTs');
      }
      // Build listing map: tokenId -> { price, isAuction, highestBid }
      if (listingResult && listingResult.res.ok) {
        try {
          const listingData = listingResult.data;
          var listings = listingData.listings || listingData || [];
          if (Array.isArray(listings)) {
            var map = {};
            listings.forEach(function(l) {
              if (l.active !== false) {
                map[String(l.tokenId)] = {
                  price: l.price,
                  isAuction: l.isAuction || false,
                  highestBid: l.highestBid || '0'
                };
              }
            });
            setListingMap(map);
          }
        } catch (_e) { /* ignore listing parse errors */ }
      }
    } catch (err) {
      console.error('Error fetching NFTs:', err);
      setError('Failed to load NFTs. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [favorites]);

  useEffect(() => {
    fetchNFTs({ force: false });
  }, [fetchNFTs, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) fetchNFTs({ force: true });
  }, [fetchNFTs, forceNonce]);

  // ── Build trait map from all NFTs (unfiltered) ──────────────────────────

  const traitMap = useMemo(() => {
    const map = {};
    nfts.forEach((nft) => {
      (nft.attributes || []).forEach((attr) => {
        if (!attr.trait_type || attr.value === undefined || attr.value === null) return;
        const traitType = String(attr.trait_type);
        const value = String(attr.value);
        if (!map[traitType]) map[traitType] = {};
        if (!map[traitType][value]) map[traitType][value] = 0;
        map[traitType][value] += 1;
      });
    });

    // Convert to array format: { traitType: [{ value, count }, ...] }
    const result = {};
    Object.entries(map).forEach(([traitType, values]) => {
      result[traitType] = Object.entries(values).map(([value, count]) => ({ value, count }));
    });
    return result;
  }, [nfts]);

  // ── Trait filter handlers ───────────────────────────────────────────────

  const toggleTraitFilter = useCallback((traitType, value) => {
    setActiveTraitFilters((prev) => {
      const exists = prev.some((f) => f.trait_type === traitType && f.value === value);
      if (exists) {
        return prev.filter((f) => !(f.trait_type === traitType && f.value === value));
      }
      return [...prev, { trait_type: traitType, value }];
    });
  }, []);

  const removeTraitFilter = useCallback((traitType, value) => {
    setActiveTraitFilters((prev) =>
      prev.filter((f) => !(f.trait_type === traitType && f.value === value))
    );
  }, []);

  const clearAllTraitFilters = useCallback(() => {
    setActiveTraitFilters([]);
  }, []);

  // ── Filter + Sort logic ─────────────────────────────────────────────────

  const filteredAndSortedNfts = useMemo(() => {
    let result = [...nfts];

    // Text search: name, token ID, description, owner address, creator address
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (nft) =>
          (nft.name && nft.name.toLowerCase().includes(query)) ||
          String(nft.tokenId).includes(query) ||
          (nft.description && nft.description.toLowerCase().includes(query)) ||
          (nft.owner && nft.owner.toLowerCase().includes(query)) ||
          (nft.creator && nft.creator.toLowerCase().includes(query))
      );
    }

    // Filter by ownership
    if (filterMode === 'mine' && account) {
      result = result.filter(
        (nft) => nft.owner && nft.owner.toLowerCase() === account.toLowerCase()
      );
    }

    // Filter by favorites
    if (filterMode === 'favorites' && favorites) {
      result = result.filter((nft) => favorites.isFavorite(nft.tokenId));
    }

    // Trait filtering: OR within same trait type, AND across different trait types
    if (activeTraitFilters.length > 0) {
      // Group filters by trait type
      const filtersByType = {};
      activeTraitFilters.forEach((f) => {
        if (!filtersByType[f.trait_type]) filtersByType[f.trait_type] = [];
        filtersByType[f.trait_type].push(f.value);
      });

      result = result.filter((nft) => {
        const attrs = nft.attributes || [];
        // For each trait type that has active filters, the NFT must have
        // at least one attribute matching one of the selected values (OR within type)
        return Object.entries(filtersByType).every(([traitType, selectedValues]) => {
          return attrs.some(
            (attr) =>
              String(attr.trait_type) === traitType &&
              selectedValues.includes(String(attr.value))
          );
        });
      });
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
        break;
      case 'oldest':
        result.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
        break;
      case 'tokenId':
        result.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
        break;
      case 'nameAZ':
        result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'nameZA':
        result.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        break;
      default:
        break;
    }

    return result;
  }, [nfts, searchQuery, sortBy, filterMode, favorites, account, activeTraitFilters]);

  // ── Pagination ──────────────────────────────────────────────────────────

  const totalPages = Math.ceil(filteredAndSortedNfts.length / ITEMS_PER_PAGE);
  const paginatedNfts = filteredAndSortedNfts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy, filterMode, activeTraitFilters]);

  // Close sidebar on route change / escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const totalFilterCount = activeTraitFilters.length;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">NFT Gallery</h1>
          <p className="text-white/50 mt-1">
            {loading
              ? 'Loading...'
              : `${filteredAndSortedNfts.length} of ${nfts.length} NFT${nfts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link
          to="/mint"
          className="px-6 py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
        >
          + Create NFT
        </Link>
      </div>

      {/* ─── Search & Sort Bar ──────────────────────────────────────────── */}
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Mobile sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all text-sm font-semibold"
          >
            <FilterIcon />
            Traits
            {totalFilterCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-[10px] font-bold">
                {totalFilterCount}
              </span>
            )}
          </button>

          {/* Search */}
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
              <SearchIcon />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, token ID, description, or address..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Toggles: All / My NFTs / Favorites */}
          <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-1 flex-shrink-0">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                filterMode === 'all'
                  ? 'bg-purple-500 text-white shadow-lg'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              All
            </button>
            {account && (
              <button
                onClick={() => setFilterMode('mine')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                  filterMode === 'mine'
                    ? 'bg-purple-500 text-white shadow-lg'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                My NFTs
              </button>
            )}
            <button
              onClick={() => setFilterMode('favorites')}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                filterMode === 'favorites'
                  ? 'bg-purple-500 text-white shadow-lg'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <HeartIcon filled={filterMode === 'favorites'} />
              Favorites
            </button>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-all appearance-none cursor-pointer flex-shrink-0"
          >
            <option value="newest" className="bg-[#141428]">Newest First</option>
            <option value="oldest" className="bg-[#141428]">Oldest First</option>
            <option value="tokenId" className="bg-[#141428]">Token ID</option>
            <option value="nameAZ" className="bg-[#141428]">Name A–Z</option>
            <option value="nameZA" className="bg-[#141428]">Name Z–A</option>
          </select>

          {/* View Toggle */}
          <div className="flex items-center bg-white/5 rounded-xl border border-white/10 p-1 flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'grid' ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
              title="Grid view"
            >
              <GridIcon active={viewMode === 'grid'} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'list' ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
              title="List view"
            >
              <ListIcon active={viewMode === 'list'} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Active Filter Tags ─────────────────────────────────────────── */}
      {activeTraitFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-white/40 text-sm font-medium">Active filters:</span>
          {activeTraitFilters.map((f) => (
            <button
              key={`${f.trait_type}::${f.value}`}
              onClick={() => removeTraitFilter(f.trait_type, f.value)}
              className="group/tag inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/25 hover:border-purple-500/50 transition-all duration-200"
            >
              <span className="text-purple-400/60">{f.trait_type}:</span>
              <span>{f.value}</span>
              <span className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-purple-500/40 transition-colors">
                <XIcon className="w-3 h-3" />
              </span>
            </button>
          ))}
          <button
            onClick={clearAllTraitFilters}
            className="text-xs text-white/40 hover:text-white/70 font-semibold px-3 py-1 rounded-full border border-white/10 hover:border-white/20 transition-all duration-200"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* ─── Main Content (Sidebar + Gallery) ───────────────────────────── */}
      <div className="flex gap-6 items-start">
        {/* Sidebar — always rendered on desktop, toggled on mobile */}
        <div className="hidden lg:block">
          <TraitSidebar
            traitMap={traitMap}
            activeFilters={activeTraitFilters}
            onToggle={toggleTraitFilter}
            onClearAll={clearAllTraitFilters}
            totalFilterCount={totalFilterCount}
            sidebarOpen={true}
            onCloseSidebar={() => {}}
          />
        </div>

        {/* Mobile sidebar */}
        <div className="lg:hidden">
          <TraitSidebar
            traitMap={traitMap}
            activeFilters={activeTraitFilters}
            onToggle={toggleTraitFilter}
            onClearAll={clearAllTraitFilters}
            totalFilterCount={totalFilterCount}
            sidebarOpen={sidebarOpen}
            onCloseSidebar={() => setSidebarOpen(false)}
          />
        </div>

        {/* Gallery content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Loading State */}
          {loading && (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : (
              <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            )
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
                onClick={fetchNFTs}
                className="px-6 py-3 rounded-xl font-semibold transition-all bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && filteredAndSortedNfts.length === 0 && (
            <div className="text-center py-16">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 flex items-center justify-center">
                <svg className="w-10 h-10 text-purple-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-white font-bold text-xl mb-2">No NFTs Found</h3>
              <p className="text-white/40 mb-6">
                {filterMode === 'favorites'
                  ? "You haven't favorited any NFTs yet."
                  : filterMode === 'mine'
                  ? "You don't own any NFTs yet."
                  : activeTraitFilters.length > 0
                  ? 'No NFTs match the selected trait filters.'
                  : searchQuery
                  ? 'No NFTs match your search.'
                  : 'Be the first to mint an NFT!'}
              </p>
              {activeTraitFilters.length > 0 ? (
                <button
                  onClick={clearAllTraitFilters}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30"
                >
                  Clear All Filters
                </button>
              ) : (
                <Link
                  to="/mint"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Mint Your First NFT
                </Link>
              )}
            </div>
          )}

          {/* ─── Grid View ─────────────────────────────────────────────── */}
          {!loading && !error && paginatedNfts.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {paginatedNfts.map((nft) => (
                <NFTCard
                  key={nft.tokenId}
                  nft={nft}
                  account={account}
                  listing={listingMap[String(nft.tokenId)]}
                  isFavorite={favorites ? favorites.isFavorite(nft.tokenId) : false}
                  onToggleFavorite={favorites ? favorites.toggleFavorite : undefined}
                  showActions={true}
                />
              ))}
            </div>
          )}

          {/* ─── List View ─────────────────────────────────────────────── */}
          {!loading && !error && paginatedNfts.length > 0 && viewMode === 'list' && (
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {/* Table header */}
              <div className="flex items-center gap-3 md:gap-4 px-3 md:px-4 py-2.5 border-b border-white/10 text-[11px] font-semibold text-white/30 uppercase tracking-wider">
                <span className="w-12 flex-shrink-0">Image</span>
                <span className="w-14 flex-shrink-0">ID</span>
                <span className="flex-1 min-w-0">Name</span>
                <span className="hidden md:block w-28 flex-shrink-0">Owner</span>
                <span className="hidden md:block w-28 flex-shrink-0">Creator</span>
                <span className="hidden lg:block w-24 flex-shrink-0">Price</span>
                <span className="hidden lg:block w-14 flex-shrink-0">Traits</span>
                <span className="hidden lg:block w-16 flex-shrink-0 text-right">Royalty</span>
                <span className="w-6 flex-shrink-0" />
              </div>

              {paginatedNfts.map((nft) => (
                <ListViewRow
                  key={nft.tokenId}
                  nft={nft}
                  account={account}
                  listing={listingMap[String(nft.tokenId)]}
                  favorites={favorites}
                />
              ))}
            </div>
          )}

          {/* ─── Pagination ────────────────────────────────────────────── */}
          {!loading && totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              {/* Results info */}
              <span className="text-sm text-white/40">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedNfts.length)} of{' '}
                {filteredAndSortedNfts.length} NFTs
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ← Previous
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    if (
                      totalPages <= 7 ||
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-semibold transition-all ${
                            currentPage === page
                              ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                              : 'bg-white/5 hover:bg-white/10 text-white/50 border border-white/10'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    }
                    if (page === 2 && currentPage > 4) {
                      return (
                        <span key={page} className="text-white/30 px-1">
                          ...
                        </span>
                      );
                    }
                    if (page === totalPages - 1 && currentPage < totalPages - 3) {
                      return (
                        <span key={page} className="text-white/30 px-1">
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
    </div>
  );
};

export default NFTGallery;
