import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Link } from 'react-router-dom';
import { shortenAddress, formatEth } from '../utils/helpers';
import { SUPPORTED_CHAIN_ID, SUPPORTED_CHAIN_NAME } from '../utils/constants';
import { fetchApiJson } from '../utils/api';

const ConnectWallet = ({ account, chainId, isConnecting, error, connectWallet, disconnectWallet }) => {
  const [balance, setBalance] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Fetch balance when connected
  useEffect(() => {
    const fetchBalance = async () => {
      if (account && window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const bal = await provider.getBalance(account);
          setBalance(ethers.formatEther(bal));
        } catch (err) {
          console.error('Error fetching balance:', err);
        }
      }
    };
    fetchBalance();
  }, [account]);

  // Fetch collection stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoadingStats(true);
        const { res, data } = await fetchApiJson('/api/nfts/stats');
        if (res.ok) {
          setStats(data.success ? data.stats : null);
        }
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, []);

  const switchToSepolia = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SUPPORTED_CHAIN_ID }],
      });
    } catch (err) {
      console.error('Error switching chain:', err);
    }
  };

  const isCorrectChain = chainId === SUPPORTED_CHAIN_ID;

  return (
    <div className="flex-1 bg-nft-darker relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-purple-500/5 to-pink-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-gray-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-green-400 mr-2 animate-pulse" />
            Live on Sepolia Testnet
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              Discover, Collect
            </span>
            <br />
            <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              & Trade Unique NFTs
            </span>
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            The CN6035 NFT platform on Sepolia — mint, collect, and trade unique digital assets in a decentralized marketplace.
          </p>
        </div>

        {/* Main Action Card */}
        <div className="max-w-lg mx-auto mb-16">
          {!account ? (
            /* Not Connected: Show Connect Button */
            <div className="bg-nft-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 flex items-center justify-center">
                <span className="text-4xl">🦊</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Connect Your Wallet</h2>
              <p className="text-gray-400 text-sm mb-6">
                Connect your MetaMask wallet to start minting, collecting, and trading NFTs on the Sepolia testnet.
              </p>
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="w-full relative px-8 py-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-lg hover:from-purple-600 hover:to-pink-600 transform hover:scale-[1.02] transition-all duration-200 shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isConnecting ? (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Connecting...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-2">
                    <span>🦊</span>
                    <span>Connect MetaMask</span>
                  </span>
                )}
                {!isConnecting && (
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse opacity-20" />
                )}
              </button>
              <p className="text-gray-600 text-xs mt-4">
                Don't have MetaMask?{' '}
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Install it here →
                </a>
              </p>
            </div>
          ) : !isCorrectChain ? (
            /* Connected but Wrong Chain */
            <div className="bg-nft-card/80 backdrop-blur-xl border border-yellow-500/20 rounded-2xl p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                <span className="text-4xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3">Wrong Network</h2>
              <p className="text-gray-400 text-sm mb-2">
                You're connected to the wrong network. Please switch to{' '}
                <span className="text-yellow-400 font-semibold">{SUPPORTED_CHAIN_NAME}</span> to continue.
              </p>
              <p className="text-gray-500 text-xs mb-6">
                Connected as: {shortenAddress(account)}
              </p>
              <button
                onClick={switchToSepolia}
                className="w-full px-8 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-semibold text-lg hover:from-yellow-600 hover:to-orange-600 transform hover:scale-[1.02] transition-all duration-200 shadow-lg shadow-yellow-500/25"
              >
                Switch to {SUPPORTED_CHAIN_NAME}
              </button>
              <button
                onClick={disconnectWallet}
                className="w-full mt-3 px-4 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 text-sm"
              >
                Disconnect Wallet
              </button>
            </div>
          ) : (
            /* Connected on Correct Chain */
            <div className="bg-nft-card/80 backdrop-blur-xl border border-green-500/20 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/20 flex items-center justify-center">
                    <span className="text-2xl">✅</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Welcome Back!</h2>
                    <p className="text-gray-400 text-sm">Wallet connected successfully</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-gray-400 text-sm">Address</span>
                  <span className="text-white font-mono text-sm">{shortenAddress(account)}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <span className="text-gray-400 text-sm">Network</span>
                  <span className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-white text-sm">{SUPPORTED_CHAIN_NAME}</span>
                  </span>
                </div>
                {balance !== null && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                    <span className="text-gray-400 text-sm">Balance</span>
                    <span className="text-white font-medium text-sm">{formatEth(balance)} ETH</span>
                  </div>
                )}
              </div>

              {/* Quick Action Buttons */}
              <div className="grid grid-cols-3 gap-3">
                <Link
                  to="/mint"
                  className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-200 group"
                >
                  <span className="text-2xl mb-1 group-hover:scale-110 transition-transform duration-200">✨</span>
                  <span className="text-white text-sm font-medium">Mint</span>
                </Link>
                <Link
                  to="/gallery"
                  className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-200 group"
                >
                  <span className="text-2xl mb-1 group-hover:scale-110 transition-transform duration-200">🖼️</span>
                  <span className="text-white text-sm font-medium">Gallery</span>
                </Link>
                <Link
                  to="/marketplace"
                  className="flex flex-col items-center p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 hover:border-green-500/40 transition-all duration-200 group"
                >
                  <span className="text-2xl mb-1 group-hover:scale-110 transition-transform duration-200">🏪</span>
                  <span className="text-white text-sm font-medium">Market</span>
                </Link>
              </div>

              <button
                onClick={disconnectWallet}
                className="w-full mt-4 px-4 py-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 text-sm"
              >
                Disconnect Wallet
              </button>
            </div>
          )}
        </div>

        {/* Stats Section */}
        <div className="max-w-4xl mx-auto">
          <h3 className="text-center text-gray-500 text-sm uppercase tracking-wider mb-6">Collection Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loadingStats ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center animate-pulse"
                >
                  <div className="w-12 h-4 bg-white/10 rounded mx-auto mb-2" />
                  <div className="w-20 h-3 bg-white/5 rounded mx-auto" />
                </div>
              ))
            ) : (
              <>
                <div className="bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center hover:border-purple-500/20 transition-all duration-200">
                  <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    {stats?.totalMinted ?? '—'}<span className="text-lg text-gray-500 font-normal"> / {stats?.maxSupply ?? '—'}</span>
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Minted / Supply</p>
                </div>
                <div className="bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center hover:border-purple-500/20 transition-all duration-200">
                  <p className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                    {stats?.totalOwners ?? '—'}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Unique Owners</p>
                </div>
                <div className="bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center hover:border-purple-500/20 transition-all duration-200">
                  <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                    {stats?.totalListings ?? '—'}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Active Listings</p>
                </div>
                <div className="bg-nft-card/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center hover:border-purple-500/20 transition-all duration-200">
                  <p className="text-3xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
                    {stats?.mintPrice ? `${stats.mintPrice} Ξ` : '— Ξ'}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Mint Price</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="max-w-4xl mx-auto mt-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-nft-card/30 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center hover:border-purple-500/20 transition-all duration-300 group">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <span className="text-3xl">🎨</span>
              </div>
              <h3 className="text-white font-semibold mb-2">Mint NFTs</h3>
              <p className="text-gray-500 text-sm">Create unique digital collectibles with custom metadata and images stored on IPFS.</p>
            </div>
            <div className="bg-nft-card/30 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center hover:border-pink-500/20 transition-all duration-300 group">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-pink-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <span className="text-3xl">💰</span>
              </div>
              <h3 className="text-white font-semibold mb-2">Trade & Sell</h3>
              <p className="text-gray-500 text-sm">List your NFTs on the marketplace and trade with others in a decentralized way.</p>
            </div>
            <div className="bg-nft-card/30 backdrop-blur-xl border border-white/5 rounded-2xl p-6 text-center hover:border-blue-500/20 transition-all duration-300 group">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                <span className="text-3xl">🔒</span>
              </div>
              <h3 className="text-white font-semibold mb-2">Secure & Transparent</h3>
              <p className="text-gray-500 text-sm">All transactions are recorded on the blockchain, ensuring complete transparency.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectWallet;
