import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const TransferNFT = ({ isOpen, onClose, onConfirm, onTransfer, tokenId, tokenName, loading }) => {
  const [recipient, setRecipient] = useState('');
  const [isValidAddress, setIsValidAddress] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setRecipient('');
      setIsValidAddress(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const handleEsc = (e) => {
        if (e.key === 'Escape' && !loading) {
          onClose();
        }
      };
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, loading, onClose]);

  useEffect(() => {
    if (recipient.length === 0) {
      setIsValidAddress(null);
    } else {
      setIsValidAddress(ethers.isAddress(recipient));
    }
  }, [recipient]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isValidAddress && !loading) {
      // Support both prop names: onTransfer (from MyNFTs/NFTDetail) or onConfirm (legacy)
      const callback = onTransfer || onConfirm;
      if (typeof callback === 'function') {
        // Both MyNFTs and NFTDetail expect (tokenId, recipientAddress)
        callback(tokenId, recipient);
      } else {
        console.error('TransferNFT: no onTransfer or onConfirm callback provided');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!loading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-nft-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in">
        {/* Gradient Top Bar */}
        <div className="h-1 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Transfer NFT #{tokenId}</h2>
                {tokenName && (
                  <p className="text-gray-400 text-sm">"{tokenName}"</p>
                )}
              </div>
            </div>
            <button
              onClick={!loading ? onClose : undefined}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Recipient Input */}
            <div className="mb-4">
              <label className="block text-gray-400 text-sm font-medium mb-2">
                Recipient Address
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value.trim())}
                  placeholder="0x..."
                  disabled={loading}
                  className={`w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border text-white placeholder-gray-600 focus:outline-none transition-all duration-200 font-mono text-sm disabled:opacity-50 ${
                    isValidAddress === null
                      ? 'border-white/10 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50'
                      : isValidAddress
                      ? 'border-green-500/50 focus:border-green-500/50 focus:ring-1 focus:ring-green-500/50'
                      : 'border-red-500/50 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50'
                  }`}
                  autoFocus
                />
                {/* Validation Icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isValidAddress === true && (
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {isValidAddress === false && (
                    <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
              {/* Validation Message */}
              {isValidAddress === false && recipient.length > 0 && (
                <p className="text-red-400 text-xs mt-1.5">Please enter a valid Ethereum address</p>
              )}
              {isValidAddress === true && (
                <p className="text-green-400 text-xs mt-1.5">Valid Ethereum address ✓</p>
              )}
            </div>

            {/* Warning */}
            <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4 mb-6">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-yellow-400 font-semibold text-sm">Irreversible Action</p>
                  <p className="text-yellow-400/70 text-xs mt-1">
                    Please double-check the recipient address. Transfers cannot be reversed. Sending to the wrong address will result in permanent loss.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all duration-200 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValidAddress || loading}
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold hover:from-purple-600 hover:to-blue-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/25"
              >
                {loading ? (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Transferring...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    <span>Transfer</span>
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TransferNFT;
