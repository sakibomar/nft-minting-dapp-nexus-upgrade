/**
 * @file useWallet.js
 * @description Custom hook for MetaMask wallet connection with chain validation.
 *              Uses toast notifications for visible feedback on ALL pages.
 */

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { SUPPORTED_CHAIN_ID, SUPPORTED_CHAIN_NAME } from '../utils/constants';

export default function useWallet() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Check localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('walletConnected');
    if (stored === 'true' && window.ethereum) {
      connectWallet();
    }
    // Listen for account/chain changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, []);

  function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
      setAccount(null);
      localStorage.removeItem('walletConnected');
      toast('Wallet disconnected', { icon: '🔌' });
    } else {
      setAccount(accounts[0]);
    }
  }

  function handleChainChanged(newChainId) {
    setChainId(newChainId);
    // Don't reload — handle gracefully
  }

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      const msg = 'MetaMask not detected. Please install the MetaMask browser extension and refresh this page.';
      setError(msg);
      toast.error(msg, { duration: 8000, icon: '🦊' });
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chain = await window.ethereum.request({ method: 'eth_chainId' });
      setAccount(accounts[0]);
      setChainId(chain);
      localStorage.setItem('walletConnected', 'true');

      // Auto-switch to Sepolia if wrong chain
      if (chain !== SUPPORTED_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: SUPPORTED_CHAIN_ID }],
          });
          toast.success('Wallet connected!', { icon: '🔗' });
        } catch (switchErr) {
          const switchMsg = `Please switch to ${SUPPORTED_CHAIN_NAME} network in MetaMask.`;
          setError(switchMsg);
          toast.error(switchMsg, { duration: 6000 });
        }
      } else {
        toast.success('Wallet connected!', { icon: '🔗' });
      }
    } catch (err) {
      if (err.code === 4001) {
        const rejectMsg = 'Connection rejected. Please approve the connection in MetaMask.';
        setError(rejectMsg);
        toast.error(rejectMsg);
      } else {
        const failMsg = 'Failed to connect wallet. Please try again.';
        setError(failMsg);
        toast.error(failMsg);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setError(null);
    localStorage.removeItem('walletConnected');
    toast('Wallet disconnected', { icon: '🔌' });
  }, []);

  return { account, chainId, isConnecting, error, connectWallet, disconnectWallet };
}
