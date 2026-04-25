/**
 * @file App.jsx
 * @description Root application component with routing for all pages.
 *              Includes wallet, contract, marketplace, favorites, and socket hooks.
 */

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

import useWallet from './hooks/useWallet';
import useContract from './hooks/useContract';
import useMarketplace from './hooks/useMarketplace';
import useFavorites from './hooks/useFavorites';
import useSocket from './hooks/useSocket';

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ConnectWallet from './components/ConnectWallet';
const MintForm = lazy(() => import('./components/MintForm'));
const NFTGallery = lazy(() => import('./components/NFTGallery'));
const Marketplace = lazy(() => import('./components/Marketplace'));
const MyNFTs = lazy(() => import('./components/MyNFTs'));
const NFTDetail = lazy(() => import('./components/NFTDetail'));
const UserProfile = lazy(() => import('./components/UserProfile'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const TransactionHistory = lazy(() => import('./components/TransactionHistory'));

function RouteLoader() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-10 w-64 rounded-xl bg-white/10" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 rounded-2xl bg-white/5" />
          <div className="space-y-4">
            <div className="h-8 rounded-xl bg-white/10" />
            <div className="h-32 rounded-2xl bg-white/5" />
            <div className="h-12 rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { account, chainId, isConnecting, error: walletError, connectWallet, disconnectWallet } = useWallet();
  const contract = useContract(account);
  const marketplace = useMarketplace(account);
  const favorites = useFavorites(account);
  const [refreshKey, setRefreshKey] = useState(0);
  const [forceNonce, setForceNonce] = useState(0);
  const refreshTimerRef = useRef(null);
  const pendingForceRefreshRef = useRef(false);
  const lastForceRefreshAtRef = useRef(0);

  const scheduleRefresh = useCallback(({ force = false } = {}) => {
    if (force && (Date.now() - lastForceRefreshAtRef.current) < 1500) {
      return;
    }

    pendingForceRefreshRef.current = pendingForceRefreshRef.current || force;

    if (refreshTimerRef.current) {
      return;
    }

    refreshTimerRef.current = window.setTimeout(() => {
      const shouldForce = pendingForceRefreshRef.current;
      pendingForceRefreshRef.current = false;
      refreshTimerRef.current = null;

      if (shouldForce) {
        lastForceRefreshAtRef.current = Date.now();
        setForceNonce((n) => n + 1);
        return;
      }

      setRefreshKey((k) => k + 1);
    }, force ? 350 : 500);
  }, []);

  // Allow components to request an immediate refresh after a user action
  // (mint/buy/burn) without waiting for the server poller/socket interval.
  useEffect(() => {
    const onForceRefresh = (e) => {
      const shouldForce = e?.detail?.force === true;
      scheduleRefresh({ force: shouldForce });
    };
    window.addEventListener('app:force-refresh', onForceRefresh);
    return () => {
      window.removeEventListener('app:force-refresh', onForceRefresh);
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [scheduleRefresh]);

  // Real-time event handler — shows toast notifications
  const handleSocketEvent = useCallback((eventType, data) => {
    if (data?.replayed) {
      return;
    }

    const etherscanBase = 'https://sepolia.etherscan.io';

    switch (eventType) {
      case 'nft:minted':
        toast.success(`NFT #${data.tokenId} minted!`, { icon: '🎨' });
        break;
      case 'nft:burned':
        toast(`NFT #${data.tokenId} burned`, { icon: '🔥' });
        break;
      case 'marketplace:sale':
        toast.success(`NFT #${data.tokenId} sold for ${data.price} ETH!`, { icon: '💰' });
        break;
      case 'marketplace:bid':
        toast(`New bid: ${data.amount} ETH on listing #${data.listingId}`, { icon: '🔨' });
        break;
      case 'marketplace:listed':
        toast(`New listing: Token #${data.tokenId}`, { icon: '📋' });
        break;
      case 'offer:made':
        toast(`New offer: ${data.amount} ETH on NFT #${data.tokenId}`, { icon: '💬' });
        break;
      case 'offer:accepted':
        toast.success(`Offer accepted on NFT #${data.tokenId}!`, { icon: '🤝' });
        break;
      default:
        break;
    }

    // Trigger a lightweight refetch in the relevant pages so the UI
    // updates immediately after on-chain state changes.
    const shouldRefresh =
      eventType === 'nft:minted' ||
      eventType === 'nft:burned' ||
      eventType === 'nft:transfer' ||
      eventType === 'marketplace:bid' ||
      eventType === 'marketplace:sale' ||
      eventType === 'marketplace:settled' ||
      eventType === 'marketplace:listed' ||
      eventType === 'marketplace:cancelled' ||
      eventType === 'marketplace:priceUpdated' ||
      eventType === 'offer:made' ||
      eventType === 'offer:accepted' ||
      eventType === 'offer:cancelled';

    if (shouldRefresh) {
      scheduleRefresh({ force: true });
    }
  }, [scheduleRefresh]);

  useSocket(handleSocketEvent);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="min-h-screen bg-nft-darker text-white flex flex-col">
        {/* Toast Notification System */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 5000,
            style: {
              background: 'rgba(15, 15, 35, 0.95)',
              color: '#e2e8f0',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '16px',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(139, 92, 246, 0.15)',
              padding: '16px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#0f0f23' },
            },
            error: {
              iconTheme: { primary: '#ef4444', secondary: '#0f0f23' },
            },
          }}
        />

        {/* Navigation */}
        <Navbar
          account={account}
          isConnecting={isConnecting}
          connectWallet={connectWallet}
          disconnectWallet={disconnectWallet}
          favoritesCount={favorites?.count ?? 0}
        />

        {/* Main Content — pt-16 offsets the fixed navbar (h-16 = 64px) */}
        <main className="flex-1 pt-16">
          <Suspense fallback={<RouteLoader />}>
            <Routes>
            <Route path="/" element={
              <ConnectWallet account={account} chainId={chainId} isConnecting={isConnecting}
                error={walletError} connectWallet={connectWallet} disconnectWallet={disconnectWallet} />
            } />
            <Route path="/mint" element={
              <MintForm
                account={account}
                contract={contract}
                connectWallet={connectWallet}
                refreshKey={refreshKey}
                forceNonce={forceNonce}
              />
            } />
            <Route path="/gallery" element={
              <NFTGallery
                account={account}
                contract={contract}
                marketplace={marketplace}
                favorites={favorites}
                refreshKey={refreshKey}
                forceNonce={forceNonce}
              />
            } />
            <Route path="/marketplace" element={
              <Marketplace
                account={account}
                contract={contract}
                marketplace={marketplace}
                connectWallet={connectWallet}
                refreshKey={refreshKey}
                forceNonce={forceNonce}
              />
            } />
            <Route path="/my-nfts" element={
              <MyNFTs
                account={account}
                contract={contract}
                marketplace={marketplace}
                favorites={favorites}
                connectWallet={connectWallet}
                refreshKey={refreshKey}
                forceNonce={forceNonce}
              />
            } />
            <Route path="/nft/:tokenId" element={
              <NFTDetail account={account} contract={contract} marketplace={marketplace}
                favorites={favorites} refreshKey={refreshKey} forceNonce={forceNonce} />
            } />
            <Route path="/profile/:address" element={
              <UserProfile
                account={account}
                contract={contract}
                marketplace={marketplace}
                refreshKey={refreshKey}
                forceNonce={forceNonce}
              />
            } />
            <Route path="/admin" element={
              <AdminDashboard
                account={account}
                contract={contract}
                marketplace={marketplace}
                refreshKey={refreshKey}
                forceNonce={forceNonce}
              />
            } />
            <Route path="/history" element={
              <TransactionHistory refreshKey={refreshKey} forceNonce={forceNonce} />
            } />
            </Routes>
          </Suspense>
        </main>

        <Footer />
      </div>
    </Router>
  );
}

export default App;
