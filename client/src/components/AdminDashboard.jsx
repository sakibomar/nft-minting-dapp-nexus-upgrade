import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { formatEth } from '../utils/helpers';
import { CONTRACT_ADDRESS, MARKETPLACE_ADDRESS, ETHERSCAN_BASE } from '../utils/constants';

const AdminDashboard = ({ account, contract, marketplace, refreshKey, forceNonce }) => {
  const navigate = useNavigate();

  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [marketplacePaused, setMarketplacePaused] = useState(false);
  const [mintPriceInput, setMintPriceInput] = useState('');
  const [maxSupplyInput, setMaxSupplyInput] = useState('');
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [contractOwner, setContractOwner] = useState(null);

  const fetchData = useCallback(async ({ force = false } = {}) => {
    if (!account) return;
    setLoading(true);
    try {
      const owner = await contract.getOwner();
      if (!owner) {
        setContractOwner(null);
        setIsOwner(false);
        setStats(null);
        setMarketplacePaused(false);
        return;
      }
      setContractOwner(owner);
      const ownerMatch = owner.toLowerCase() === account.toLowerCase();
      setIsOwner(ownerMatch);
      
      // FIX: Log for debugging admin access issues
      console.log(`🔍 Admin Access Check:
        Your address:    ${account}
        Contract owner:  ${owner}
        Match:           ${ownerMatch}`);

      if (!ownerMatch) {
        setLoading(false);
        return;
      }

      const [contractStats, isMarketplacePaused] = await Promise.all([
        contract.getContractStats({ force }),
        marketplace?.isPaused ? marketplace.isPaused() : Promise.resolve(false),
      ]);
      setStats(contractStats);
      setMarketplacePaused(Boolean(isMarketplacePaused));
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, [account, contract, marketplace]);

  useEffect(() => {
    fetchData({ force: false });
  }, [fetchData, refreshKey]);

  useEffect(() => {
    if (forceNonce > 0) {
      fetchData({ force: true });
    }
  }, [fetchData, forceNonce]);

  const handlePauseContract = async () => {
    setActionLoading((prev) => ({ ...prev, pauseContract: true }));
    try {
      if (stats.isPaused) {
        toast.loading('Unpausing contract...', { id: 'pause-contract' });
        await contract.unpauseContract();
        toast.success('Contract unpaused!', { id: 'pause-contract' });
      } else {
        toast.loading('Pausing contract...', { id: 'pause-contract' });
        await contract.pauseContract();
        toast.success('Contract paused!', { id: 'pause-contract' });
      }
      fetchData({ force: true });
    } catch (err) {
      console.error('Pause/unpause failed:', err);
      toast.error(err.reason || 'Failed to update contract state', { id: 'pause-contract' });
    } finally {
      setActionLoading((prev) => ({ ...prev, pauseContract: false }));
    }
  };

  const handlePauseMarketplace = async () => {
    setActionLoading((prev) => ({ ...prev, pauseMarketplace: true }));
    try {
      if (marketplacePaused) {
        toast.loading('Unpausing marketplace...', { id: 'pause-market' });
        await marketplace.unpauseMarketplace();
        toast.success('Marketplace unpaused!', { id: 'pause-market' });
        setMarketplacePaused(false);
      } else {
        toast.loading('Pausing marketplace...', { id: 'pause-market' });
        await marketplace.pauseMarketplace();
        toast.success('Marketplace paused!', { id: 'pause-market' });
        setMarketplacePaused(true);
      }
    } catch (err) {
      console.error('Marketplace pause/unpause failed:', err);
      toast.error(err.reason || 'Failed to update marketplace state', { id: 'pause-market' });
    } finally {
      setActionLoading((prev) => ({ ...prev, pauseMarketplace: false }));
    }
  };

  const handleUpdateMintPrice = async () => {
    if (!mintPriceInput || parseFloat(mintPriceInput) < 0) {
      toast.error('Please enter a valid mint price');
      return;
    }
    setActionLoading((prev) => ({ ...prev, mintPrice: true }));
    try {
      const nextMintPrice = mintPriceInput.trim();
      toast.loading('Updating mint price...', { id: 'mint-price' });
      await contract.updateMintPrice(nextMintPrice);
      setStats((prev) => (prev ? { ...prev, mintPrice: nextMintPrice } : prev));
      toast.success('Mint price updated!', { id: 'mint-price' });
      setMintPriceInput('');
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));
      await fetchData({ force: true });
    } catch (err) {
      console.error('Update mint price failed:', err);
      toast.error(err.reason || 'Failed to update mint price', { id: 'mint-price' });
    } finally {
      setActionLoading((prev) => ({ ...prev, mintPrice: false }));
    }
  };

  const handleUpdateMaxSupply = async () => {
    if (!maxSupplyInput || parseInt(maxSupplyInput) <= 0) {
      toast.error('Please enter a valid max supply');
      return;
    }
    setActionLoading((prev) => ({ ...prev, maxSupply: true }));
    try {
      toast.loading('Updating max supply...', { id: 'max-supply' });
      await contract.updateMaxSupply(maxSupplyInput);
      toast.success('Max supply updated!', { id: 'max-supply' });
      setMaxSupplyInput('');
      fetchData({ force: true });
    } catch (err) {
      console.error('Update max supply failed:', err);
      toast.error(err.reason || 'Failed to update max supply', { id: 'max-supply' });
    } finally {
      setActionLoading((prev) => ({ ...prev, maxSupply: false }));
    }
  };

  const handleWithdraw = async () => {
    setActionLoading((prev) => ({ ...prev, withdraw: true }));
    try {
      toast.loading('Withdrawing funds...', { id: 'withdraw' });
      await contract.withdraw();
      toast.success('Funds withdrawn successfully!', { id: 'withdraw' });
      setShowWithdrawConfirm(false);
      fetchData({ force: true });
    } catch (err) {
      console.error('Withdraw failed:', err);
      toast.error(err.reason || 'Failed to withdraw funds', { id: 'withdraw' });
    } finally {
      setActionLoading((prev) => ({ ...prev, withdraw: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="h-10 bg-white/10 rounded-lg w-64 mb-8 animate-pulse" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 animate-pulse">
                <div className="h-8 bg-white/10 rounded mb-2" />
                <div className="h-4 bg-white/10 rounded w-3/4" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 animate-pulse">
                <div className="h-6 bg-white/10 rounded w-1/2 mb-4" />
                <div className="h-12 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Access Denied</h2>
          <p className="text-gray-400 mb-6">Owner Only — You are not authorized to access the admin dashboard.</p>
          
          {/* FIX: Show addresses for debugging */}
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 mb-6 text-left text-xs">
            <p className="text-gray-400 font-mono break-all mb-2">
              <span className="text-red-400">Your Address:</span><br/>
              {account}
            </p>
            <p className="text-gray-400 font-mono break-all">
              <span className="text-red-400">Contract Owner:</span><br/>
              {contractOwner || 'Loading...'}
            </p>
          </div>
          
          <button
            onClick={() => navigate(-1)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          <span className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold">
            Admin
          </span>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <p className="text-2xl font-bold text-white">{stats.totalMinted?.toString() || '0'}</p>
              <p className="text-sm text-gray-400 mt-1">Total Minted</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <p className="text-2xl font-bold text-white">{stats.totalSupply?.toString() || '0'}</p>
              <p className="text-sm text-gray-400 mt-1">Active Supply</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <p className="text-2xl font-bold text-white">{(stats.totalBurned ?? stats.burnedCount ?? 0).toString()}</p>
              <p className="text-sm text-gray-400 mt-1">Burned</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <p className="text-2xl font-bold text-white">{stats.maxSupply?.toString() || '0'}</p>
              <p className="text-sm text-gray-400 mt-1">Max Supply</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <p className="text-2xl font-bold text-white">{stats.mintPrice ?? '0'}</p>
              <p className="text-sm text-gray-400 mt-1">Mint Price (ETH)</p>
            </div>
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-purple-500/30 transition-colors">
              <p className="text-2xl font-bold text-white">{formatEth(stats.contractBalance)}</p>
              <p className="text-sm text-gray-400 mt-1">Balance (ETH)</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Pause/Unpause NFT Contract */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">NFT Contract</h3>
            <p className="text-sm text-gray-400 mb-4">
              Current state:{' '}
              <span className={`font-semibold ${stats?.isPaused ? 'text-red-400' : 'text-green-400'}`}>
                {stats?.isPaused ? 'Paused' : 'Active'}
              </span>
            </p>
            <button
              onClick={handlePauseContract}
              disabled={actionLoading.pauseContract}
              className={`w-full rounded-xl px-6 py-3 font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                stats?.isPaused
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:opacity-90'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
              }`}
            >
              {actionLoading.pauseContract ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </>
              ) : stats?.isPaused ? (
                'Unpause Contract'
              ) : (
                'Pause Contract'
              )}
            </button>
          </div>

          {/* Pause/Unpause Marketplace */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">Marketplace</h3>
            <p className="text-sm text-gray-400 mb-4">
              Current state:{' '}
              <span className={`font-semibold ${marketplacePaused ? 'text-red-400' : 'text-green-400'}`}>
                {marketplacePaused ? 'Paused' : 'Active'}
              </span>
            </p>
            <button
              onClick={handlePauseMarketplace}
              disabled={actionLoading.pauseMarketplace}
              className={`w-full rounded-xl px-6 py-3 font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                marketplacePaused
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:opacity-90'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20'
              }`}
            >
              {actionLoading.pauseMarketplace ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </>
              ) : marketplacePaused ? (
                'Unpause Marketplace'
              ) : (
                'Pause Marketplace'
              )}
            </button>
          </div>

          {/* Update Mint Price */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">Update Mint Price</h3>
            <p className="text-sm text-gray-400 mb-4">
              Current price:{' '}
              <span className="font-semibold text-white">{stats?.mintPrice ?? '—'} ETH</span>
            </p>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={mintPriceInput}
                  onChange={(e) => setMintPriceInput(e.target.value)}
                  placeholder="New price in ETH"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-14 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ETH</span>
              </div>
              <button
                onClick={handleUpdateMintPrice}
                disabled={actionLoading.mintPrice || !mintPriceInput}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading.mintPrice ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Updating...
                  </>
                ) : (
                  'Update'
                )}
              </button>
            </div>
          </div>

          {/* Update Max Supply */}
          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-2">Update Max Supply</h3>
            <p className="text-sm text-gray-400 mb-4">
              Current max supply:{' '}
              <span className="font-semibold text-white">{stats ? stats.maxSupply?.toString() : '—'}</span>
            </p>
            <div className="flex gap-3">
              <input
                type="number"
                min="1"
                value={maxSupplyInput}
                onChange={(e) => setMaxSupplyInput(e.target.value)}
                placeholder="New max supply"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
              <button
                onClick={handleUpdateMaxSupply}
                disabled={actionLoading.maxSupply || !maxSupplyInput}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading.maxSupply ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Updating...
                  </>
                ) : (
                  'Update'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Withdraw Section */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
          <h3 className="text-lg font-bold text-white mb-2">Withdraw Contract Balance</h3>
          <p className="text-sm text-gray-400 mb-4">
            Available balance:{' '}
            <span className="font-semibold text-white text-lg">{stats ? formatEth(stats.contractBalance) : '—'} ETH</span>
          </p>

          {!showWithdrawConfirm ? (
            <button
              onClick={() => setShowWithdrawConfirm(true)}
              disabled={!stats || stats.contractBalance === '0' || stats.contractBalance === 0}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Withdraw All
            </button>
          ) : (
            <div className="backdrop-blur-xl bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <p className="text-sm text-red-300 mb-4">
                Are you sure you want to withdraw <span className="font-bold">{stats ? formatEth(stats.contractBalance) : '0'} ETH</span> from the contract?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowWithdrawConfirm(false)}
                  className="flex-1 backdrop-blur-xl bg-white/5 border border-white/10 text-white rounded-xl px-6 py-3 font-semibold hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={actionLoading.withdraw}
                  className="flex-1 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl px-6 py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading.withdraw ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Withdrawing...
                    </>
                  ) : (
                    'Confirm Withdraw'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Contract Addresses */}
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Contract Addresses</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <div>
                <p className="text-sm text-gray-400">NFT Contract</p>
                <p className="text-white font-mono text-sm break-all">{CONTRACT_ADDRESS}</p>
              </div>
              <a
                href={`${ETHERSCAN_BASE}/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors ml-4 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Etherscan
              </a>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <div>
                <p className="text-sm text-gray-400">Marketplace Contract</p>
                <p className="text-white font-mono text-sm break-all">{MARKETPLACE_ADDRESS}</p>
              </div>
              <a
                href={`${ETHERSCAN_BASE}/address/${MARKETPLACE_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300 transition-colors ml-4 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Etherscan
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
