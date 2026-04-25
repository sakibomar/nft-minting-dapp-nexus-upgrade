/**
 * @file useFavorites.js
 * @description Custom hook for NFT favorites/watchlist using localStorage.
 */

import { useState, useCallback, useEffect } from 'react';

function getStorageKey(account) {
  return `nft_favorites_${(account || '').toLowerCase()}`;
}

function normalizeTokenId(tokenId) {
  return String(tokenId);
}

export default function useFavorites(account) {
  const [favorites, setFavorites] = useState(new Set());

  // Load favorites from localStorage when account changes
  useEffect(() => {
    if (!account) {
      setFavorites(new Set());
      return;
    }
    try {
      const stored = localStorage.getItem(getStorageKey(account));
      if (stored) {
        const parsed = JSON.parse(stored);
        setFavorites(new Set(Array.isArray(parsed) ? parsed.map(normalizeTokenId) : []));
      } else {
        setFavorites(new Set());
      }
    } catch {
      setFavorites(new Set());
    }
  }, [account]);

  const saveFavorites = useCallback((newFavs) => {
    if (!account) return;
    try {
      localStorage.setItem(getStorageKey(account), JSON.stringify([...newFavs]));
    } catch { /* ignore */ }
  }, [account]);

  const toggleFavorite = useCallback((tokenId) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const normalized = normalizeTokenId(tokenId);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      saveFavorites(next);
      return next;
    });
  }, [saveFavorites]);

  const removeFavorite = useCallback((tokenId) => {
    setFavorites((prev) => {
      const normalized = normalizeTokenId(tokenId);
      if (!prev.has(normalized)) {
        return prev;
      }

      const next = new Set(prev);
      next.delete(normalized);
      saveFavorites(next);
      return next;
    });
  }, [saveFavorites]);

  const pruneFavorites = useCallback((tokenIds) => {
    const normalizedIds = Array.isArray(tokenIds) ? tokenIds.map(normalizeTokenId) : [];
    if (normalizedIds.length === 0) {
      return;
    }

    setFavorites((prev) => {
      let changed = false;
      const next = new Set(prev);

      normalizedIds.forEach((tokenId) => {
        if (next.delete(tokenId)) {
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }

      saveFavorites(next);
      return next;
    });
  }, [saveFavorites]);

  const isFavorite = useCallback((tokenId) => {
    return favorites.has(normalizeTokenId(tokenId));
  }, [favorites]);

  const getFavoritesList = useCallback(() => {
    return [...favorites];
  }, [favorites]);

  return {
    favorites,
    toggleFavorite,
    removeFavorite,
    pruneFavorites,
    isFavorite,
    getFavoritesList,
    count: favorites.size,
  };
}
