import { getApiUrl } from './api';

/**
 * @file helpers.js
 * @description Utility functions used across the NFT DApp.
 */

/**
 * Shorten an Ethereum address for display.
 * @param {string} address - Full Ethereum address
 * @param {number} chars - Characters to show from each end (default: 4)
 * @returns {string} Shortened address like "0x1234...abcd"
 */
export function shortenAddress(address, chars = 4) {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format ETH value for display.
 * @param {string|number} value - ETH value
 * @param {number} decimals - Decimal places (default: 4)
 * @returns {string} Formatted value like "0.0100"
 */
export function formatEth(value, decimals = 4) {
  if (!value && value !== 0) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return num.toFixed(decimals);
}

/**
 * Format a Unix timestamp to a readable date string.
 * @param {number} timestamp - Unix timestamp in seconds
 * @returns {string} Formatted date
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Format time remaining for auctions.
 * @param {number} endTime - Auction end time (Unix seconds)
 * @returns {string} Human-readable time remaining
 */
export function formatTimeRemaining(endTime) {
  // FIX: Guard against undefined / NaN — previously produced "NaNm"
  if (!endTime && endTime !== 0) return 'N/A';
  const end = Number(endTime);
  if (isNaN(end)) return 'N/A';
  const now = Math.floor(Date.now() / 1000);
  const diff = end - now;
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Get Etherscan URL for a transaction, address, or token.
 * @param {string} type - 'tx', 'address', or 'token'
 * @param {string} value - Hash, address, or token ID
 * @returns {string} Etherscan URL
 */
export function getEtherscanUrl(type, value) {
  const base = 'https://sepolia.etherscan.io';
  if (type === 'tx') return `${base}/tx/${value}`;
  if (type === 'address') return `${base}/address/${value}`;
  if (type === 'token') return `${base}/token/${value}`;
  return base;
}

/**
 * Resolve an IPFS URI to a usable URL (via server proxy).
 * @param {string} uri - IPFS URI (ipfs://...) or HTTP URL
 * @returns {string} Resolved URL
 */
export function resolveIpfsUrl(uri) {
  if (!uri) return '';
  const value = String(uri).trim();
  if (!value) return '';

  if (value.startsWith('/api/')) {
    return getApiUrl(value);
  }

  if (value.startsWith('ipfs://')) {
    const cid = value.replace('ipfs://', '');
    return getApiUrl(`/api/ipfs/${cid}`);
  }

  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{20,})$/.test(value)) {
    return getApiUrl(`/api/ipfs/${value}`);
  }

  return value;
}

/**
 * Copy text to clipboard.
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
