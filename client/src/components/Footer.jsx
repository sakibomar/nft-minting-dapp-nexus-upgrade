import React from 'react';
import { Link } from 'react-router-dom';
import { shortenAddress, getEtherscanUrl } from '../utils/helpers';
import { CONTRACT_ADDRESS, MARKETPLACE_ADDRESS } from '../utils/constants';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-nft-darker border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-white font-bold text-xs">NFT</span>
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                CN6035 NFT Collection
              </span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed">
              Built for CN6035 Hybrid DApp Development — UEL
            </p>
            <p className="text-gray-600 text-xs">
              A decentralized NFT platform showcasing minting, trading, and marketplace functionality on the Ethereum Sepolia testnet.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h3 className="text-gray-300 font-semibold text-sm uppercase tracking-wider">Quick Links</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/gallery"
                className="text-gray-500 hover:text-purple-400 text-sm transition-colors duration-200"
              >
                Gallery
              </Link>
              <Link
                to="/marketplace"
                className="text-gray-500 hover:text-purple-400 text-sm transition-colors duration-200"
              >
                Marketplace
              </Link>
              <Link
                to="/mint"
                className="text-gray-500 hover:text-purple-400 text-sm transition-colors duration-200"
              >
                Mint NFT
              </Link>
              <Link
                to="/my-nfts"
                className="text-gray-500 hover:text-purple-400 text-sm transition-colors duration-200"
              >
                My NFTs
              </Link>
              <Link
                to="/history"
                className="text-gray-500 hover:text-purple-400 text-sm transition-colors duration-200"
              >
                History
              </Link>
              <Link
                to="/admin"
                className="text-gray-500 hover:text-purple-400 text-sm transition-colors duration-200"
              >
                Admin
              </Link>
            </div>
          </div>

          {/* Contract Addresses */}
          <div className="space-y-4">
            <h3 className="text-gray-300 font-semibold text-sm uppercase tracking-wider">Smart Contracts</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-gray-600 text-xs uppercase tracking-wider">NFT Contract</p>
                <a
                  href={getEtherscanUrl('address', CONTRACT_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors duration-200"
                >
                  <span className="font-mono">{shortenAddress(CONTRACT_ADDRESS)}</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
              <div className="space-y-1">
                <p className="text-gray-600 text-xs uppercase tracking-wider">Marketplace Contract</p>
                <a
                  href={getEtherscanUrl('address', MARKETPLACE_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors duration-200"
                >
                  <span className="font-mono">{shortenAddress(MARKETPLACE_ADDRESS)}</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
          <p className="text-gray-600 text-xs">
            © {currentYear} CN6035 NFT Collection. All rights reserved.
          </p>
          <div className="flex items-center space-x-2 text-gray-600 text-xs">
            <span>Powered by</span>
            <span className="text-purple-400 font-medium">Ethereum Sepolia</span>
            <span>•</span>
            <span className="text-pink-400 font-medium">React</span>
            <span>•</span>
            <span className="text-purple-400 font-medium">Solidity</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
