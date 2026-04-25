/**
 * @file useContract.js
 * @description Custom hook for NFTMinter contract interactions.
 *
 * FIX APPLIED:
 *   - updateMintPrice() now converts ETH → wei via ethers.parseEther()
 *     before calling the on-chain function (which expects uint256 in wei).
 *     Previously it passed the raw decimal string ("0.01") which made
 *     ethers.js throw "invalid BigNumberish string" because you can't
 *     convert a decimal to a BigInt.
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, MARKETPLACE_ADDRESS } from '../utils/constants';
import { fetchApi, fetchApiJson } from '../utils/api';

function normalizeMintPriceStats(stats) {
  if (!stats) return null;

  let eth = stats.mintPrice != null ? stats.mintPrice.toString() : null;
  let wei = stats.mintPriceWei != null ? stats.mintPriceWei.toString() : null;

  if (!wei && eth != null) {
    try {
      wei = ethers.parseEther(eth).toString();
    } catch {
      wei = null;
    }
  }

  if ((eth == null || eth === '') && wei != null) {
    try {
      eth = ethers.formatEther(wei);
    } catch {
      eth = null;
    }
  }

  if (eth == null || wei == null) {
    return null;
  }

  return { eth, wei };
}

export default function useContract(account) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearNftCache = useCallback(async () => {
    const results = await Promise.allSettled([
      fetchApi('/api/nfts/cache/clear', { method: 'POST' }, { expectJson: true }),
      fetchApi('/api/history/cache/clear', { method: 'POST' }, { expectJson: true }),
    ]);

    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.warn('Failed to clear backend cache:', result.reason);
      }
    });
  }, []);

  const getBrowserProvider = useCallback(() => {
    if (!window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  const getReadOnlyContract = useCallback(() => {
    const provider = getBrowserProvider();
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  }, [getBrowserProvider]);

  function getContract(needsSigner = false) {
    const provider = getBrowserProvider();
    if (!provider) throw new Error('MetaMask not found');
    if (needsSigner) {
      return provider.getSigner().then((signer) => new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
    }
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  }

  const mintNFT = useCallback(async (tokenURI, royaltyBps, mintPrice) => {
    setLoading(true);
    setError(null);
    try {
      const contract = await getContract(true);
      const tx = await contract.mintNFT(tokenURI, royaltyBps, { value: mintPrice });
      const receipt = await tx.wait();
      await clearNftCache();
      return { tx, receipt };
    } catch (err) {
      const msg = err.reason || err.message || 'Minting failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearNftCache]);

  const burnNFT = useCallback(async (tokenId) => {
    setLoading(true);
    setError(null);
    try {
      const contract = await getContract(true);
      const tx = await contract.burn(tokenId);
      const receipt = await tx.wait();
      await clearNftCache();
      return { tx, receipt };
    } catch (err) {
      const msg = err.reason || err.message || 'Burn failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearNftCache]);

  const transferNFT = useCallback(async (from, to, tokenId) => {
    setLoading(true);
    setError(null);
    try {
      const contract = await getContract(true);
      const tx = await contract.transferFrom(from, to, tokenId);
      const receipt = await tx.wait();
      await clearNftCache();
      return { tx, receipt };
    } catch (err) {
      const msg = err.reason || err.message || 'Transfer failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account, clearNftCache]);

  const approveMarketplace = useCallback(async (tokenId) => {
    setLoading(true);
    setError(null);
    try {
      const contract = await getContract(true);
      const tx = await contract.approve(MARKETPLACE_ADDRESS, tokenId);
      await tx.wait();
      return tx;
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account]);

  const approveAllMarketplace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const contract = await getContract(true);
      const tx = await contract.setApprovalForAll(MARKETPLACE_ADDRESS, true);
      await tx.wait();
      return tx;
    } catch (err) {
      setError(err.reason || err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [account]);

  const getLiveContractStats = useCallback(async () => {
    try {
      const provider = getBrowserProvider();
      const contract = getReadOnlyContract();

      if (!provider || !contract) {
        return null;
      }

      const [
        totalMinted,
        totalSupply,
        maxSupply,
        mintPrice,
        burnedCount,
        isPaused,
        contractOwner,
        contractBalance,
      ] = await Promise.all([
        contract.getTotalMinted(),
        contract.totalSupply(),
        contract.maxSupply(),
        contract.mintPrice(),
        contract.getBurnedCount(),
        contract.paused(),
        contract.owner(),
        provider.getBalance(CONTRACT_ADDRESS),
      ]);

      const remainingSupply = maxSupply > totalMinted ? maxSupply - totalMinted : 0n;
      const burned = burnedCount.toString();

      return {
        totalMinted: totalMinted.toString(),
        totalSupply: totalSupply.toString(),
        maxSupply: maxSupply.toString(),
        mintPrice: ethers.formatEther(mintPrice),
        mintPriceWei: mintPrice.toString(),
        burnedCount: burned,
        totalBurned: burned,
        remainingSupply: remainingSupply.toString(),
        isPaused: Boolean(isPaused),
        contractOwner,
        contractBalance: ethers.formatEther(contractBalance),
      };
    } catch (err) {
      console.warn('Failed to read live contract stats:', err);
      return null;
    }
  }, [getBrowserProvider, getReadOnlyContract]);

  const getContractStats = useCallback(async (options = {}) => {
    const force = options.force === true;
    const [serverStats, liveStats] = await Promise.all([
      (async () => {
        try {
          const { data } = await fetchApiJson(`/api/nfts/stats${force ? '?force=1' : ''}`);
          return data.success ? data.stats : null;
        } catch {
          return null;
        }
      })(),
      getLiveContractStats(),
    ]);

    if (serverStats && liveStats) {
      return {
        ...serverStats,
        ...liveStats,
      };
    }

    return liveStats || serverStats || null;
  }, [getLiveContractStats]);

  const getMintPrice = useCallback(async () => {
    const liveStats = await getLiveContractStats();
    const liveMintPrice = normalizeMintPriceStats(liveStats);
    if (liveMintPrice) {
      return liveMintPrice;
    }

    const serverStats = await getContractStats({ force: true });
    const serverMintPrice = normalizeMintPriceStats(serverStats);
    return serverMintPrice || { eth: '0', wei: '0' };
  }, [getContractStats, getLiveContractStats]);

  const getNFTs = useCallback(async (options = {}) => {
    const force = options.force === true;
    try {
      const { data } = await fetchApiJson(`/api/nfts${force ? '?force=1' : ''}`);
      return data.success ? data.nfts : [];
    } catch {
      return [];
    }
  }, []);

  const getNFTsByOwner = useCallback(async (address, options = {}) => {
    const force = options.force === true;
    try {
      const url = `/api/nfts/owner/${address}${force ? '?force=1' : ''}`;
      const { data } = await fetchApiJson(url);
      return data.success ? data.nfts : [];
    } catch {
      return [];
    }
  }, []);

  const getNFTById = useCallback(async (tokenId, options = {}) => {
    const force = options.force === true;
    try {
      const url = `/api/nfts/${tokenId}${force ? '?force=1' : ''}`;
      const { data } = await fetchApiJson(url);
      return data.success ? data.nft : null;
    } catch {
      return null;
    }
  }, []);

  const isApprovedForAll = useCallback(async (owner) => {
    try {
      const contract = getContract();
      return await contract.isApprovedForAll(owner, MARKETPLACE_ADDRESS);
    } catch {
      return false;
    }
  }, []);

  // Admin functions
  const withdraw = useCallback(async () => {
    const contract = await getContract(true);
    const tx = await contract.withdraw();
    const receipt = await tx.wait();
    await clearNftCache();
    return receipt;
  }, [account, clearNftCache]);

  // ─── FIX: Convert ETH → wei before calling on-chain function ────────
  const updateMintPrice = useCallback(async (newPriceInEth) => {
    const contract = await getContract(true);
    const priceWei = ethers.parseEther(newPriceInEth.toString());
    const tx = await contract.updateMintPrice(priceWei);
    const receipt = await tx.wait();
    await clearNftCache();
    return receipt;
  }, [account, clearNftCache]);

  const updateMaxSupply = useCallback(async (newSupply) => {
    const contract = await getContract(true);
    const tx = await contract.updateMaxSupply(newSupply);
    const receipt = await tx.wait();
    await clearNftCache();
    return receipt;
  }, [account, clearNftCache]);

  const pauseContract = useCallback(async () => {
    const contract = await getContract(true);
    const tx = await contract.pause();
    const receipt = await tx.wait();
    await clearNftCache();
    return receipt;
  }, [account, clearNftCache]);

  const unpauseContract = useCallback(async () => {
    const contract = await getContract(true);
    const tx = await contract.unpause();
    const receipt = await tx.wait();
    await clearNftCache();
    return receipt;
  }, [account, clearNftCache]);

  const getOwner = useCallback(async () => {
    try {
      const contract = getContract();
      return await contract.owner();
    } catch {
      return null;
    }
  }, []);

  const isPaused = useCallback(async () => {
    try {
      const contract = getContract();
      return await contract.paused();
    } catch {
      return false;
    }
  }, []);

  return {
    loading, error,
    mintNFT, burnNFT, transferNFT,
    approveMarketplace, approveAllMarketplace, isApprovedForAll,
    getContractStats, getMintPrice, getNFTs, getNFTsByOwner, getNFTById,
    withdraw, updateMintPrice, updateMaxSupply,
    pauseContract, unpauseContract, getOwner, isPaused,
  };
}
