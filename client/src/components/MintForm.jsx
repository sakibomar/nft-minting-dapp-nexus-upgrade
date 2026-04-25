import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { ETHERSCAN_BASE } from '../utils/constants';
import { fetchApiJson } from '../utils/api';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const STEPS = [
  { num: 1, label: 'Upload' },
  { num: 2, label: 'Details' },
  { num: 3, label: 'Mint' },
];

const MintForm = ({ account, contract, connectWallet, refreshKey, forceNonce }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [ipfsCid, setIpfsCid] = useState('');
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [attributes, setAttributes] = useState([{ trait_type: '', value: '' }]);
  const [royalty, setRoyalty] = useState(5);

  const [mintPrice, setMintPrice] = useState('0');
  const [minting, setMinting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fetchMintPrice = useCallback(async () => {
    try {
      const liveMintPrice = contract?.getMintPrice ? await contract.getMintPrice() : null;
      if (liveMintPrice?.eth != null) {
        setMintPrice(liveMintPrice.eth.toString());
        return;
      }

      const stats = await contract.getContractStats({ force: true });
      if (stats?.mintPrice != null) {
        setMintPrice(stats.mintPrice.toString());
      }
    } catch (err) {
      console.error('Failed to fetch mint price:', err);
    }
  }, [contract]);

  useEffect(() => {
    fetchMintPrice();
  }, [fetchMintPrice, refreshKey, forceNonce]);

  const validateFile = (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Invalid file type. Please upload PNG, JPEG, GIF, WebP, or SVG.');
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 10MB.');
      return false;
    }
    return true;
  };

  const handleFileSelect = useCallback((file) => {
    if (!file || !validateFile(file)) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
    setIpfsCid('');
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, [handleFileSelect]);

  const uploadToIPFS = async () => {
    if (!imageFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      const { data } = await fetchApiJson('/api/upload/image', {
        method: 'POST',
        body: formData,
      });
      if (data.success && data.data && data.data.ipfsHash) {
        setIpfsCid(data.data.ipfsHash);
        toast.success('Image uploaded to IPFS!');
        setCurrentStep(2);
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setIpfsCid('');
  };

  const addAttribute = () => {
    setAttributes([...attributes, { trait_type: '', value: '' }]);
  };

  const removeAttribute = (index) => {
    if (attributes.length <= 1) {
      setAttributes([{ trait_type: '', value: '' }]);
      return;
    }
    setAttributes(attributes.filter((_, i) => i !== index));
  };

  const updateAttribute = (index, field, value) => {
    const updated = [...attributes];
    updated[index] = { ...updated[index], [field]: value };
    setAttributes(updated);
  };

  const handleMint = async () => {
    if (!account) {
      toast.error('Please connect your wallet first.');
      return;
    }
    if (!name.trim() || !ipfsCid) {
      toast.error('Please provide a name and upload an image.');
      return;
    }

    setMinting(true);
    try {
      const filteredAttributes = attributes.filter(
        (a) => a.trait_type.trim() !== '' && a.value.trim() !== ''
      );

      const { data: metadataData } = await fetchApiJson('/api/upload/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          image: ipfsCid,
          attributes: filteredAttributes,
        }),
      });
      if (!metadataData.success || !metadataData.data || !metadataData.data.tokenURI) {
        toast.error(metadataData.error || 'Failed to upload metadata');
        setMinting(false);
        return;
      }

      const royaltyBps = royalty * 100;
      let mintPriceWei;

      try {
        const liveMintPrice = contract?.getMintPrice ? await contract.getMintPrice() : null;
        if (liveMintPrice?.wei != null) {
          mintPriceWei = BigInt(liveMintPrice.wei);
          if (liveMintPrice.eth != null) {
            setMintPrice(liveMintPrice.eth.toString());
          }
        }
      } catch (priceErr) {
        console.warn('Failed to refresh mint price before minting:', priceErr);
      }

      if (mintPriceWei == null) {
        mintPriceWei = ethers.parseEther(mintPrice.toString());
      }

      const { tx: mintTx } = await contract.mintNFT(
        metadataData.data.tokenURI,
        royaltyBps,
        mintPriceWei
      );

      toast.success(
        <div>
          <p className="font-semibold">NFT Minted Successfully! 🎉</p>
          <a
            href={`${ETHERSCAN_BASE}/tx/${mintTx.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline text-sm"
          >
            View on Etherscan
          </a>
        </div>,
        { duration: 8000 }
      );

      // Force UI refresh across pages (Gallery / My NFTs / Marketplace)
      // so the new token appears immediately without waiting for the server poller.
      window.dispatchEvent(new CustomEvent('app:force-refresh', { detail: { force: true } }));

      // Reset form
      setCurrentStep(1);
      setImageFile(null);
      setImagePreview(null);
      setIpfsCid('');
      setName('');
      setDescription('');
      setAttributes([{ trait_type: '', value: '' }]);
      setRoyalty(5);
    } catch (err) {
      console.error('Mint error:', err);
      toast.error(err.reason || err.message || 'Minting failed');
    } finally {
      setMinting(false);
    }
  };

  const canProceedStep1 = imageFile !== null;
  const canProceedStep2 = name.trim() !== '';
  const canMint = ipfsCid && name.trim() !== '';

  /* ─── Wallet Guard: no wallet → show connect prompt ─── */
  if (!account) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Connect Your Wallet</h2>
          <p className="text-white/50 mb-8 max-w-md mx-auto">
            You need to connect your MetaMask wallet to mint NFTs on this platform.
          </p>
          <button
            onClick={connectWallet}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:from-purple-600 hover:to-pink-600 transform hover:scale-105 transition-all duration-200 shadow-lg shadow-purple-500/25"
          >
            🦊 Connect MetaMask
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Create Your NFT</h2>
          <p className="text-white/50">Transform your digital art into a unique NFT</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-10">
          {STEPS.map((step, idx) => (
            <React.Fragment key={step.num}>
              <button
                onClick={() => {
                  if (step.num === 1) setCurrentStep(1);
                  else if (step.num === 2 && ipfsCid) setCurrentStep(2);
                  else if (step.num === 3 && ipfsCid && name.trim()) setCurrentStep(3);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                  currentStep === step.num
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/25'
                    : currentStep > step.num
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-white/5 text-white/30 border border-white/10'
                }`}
              >
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                  {currentStep > step.num ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    step.num
                  )}
                </span>
                <span className="font-semibold text-sm">{step.label}</span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 mx-2 rounded-full transition-colors duration-300 ${
                  currentStep > step.num ? 'bg-purple-500' : 'bg-white/10'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Upload */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {!imagePreview ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer ${
                  dragActive
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-white/20 hover:border-purple-500/50 hover:bg-white/5'
                }`}
                onClick={() => document.getElementById('file-input').click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
                  }}
                />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-lg">
                      {dragActive ? 'Drop your image here' : 'Drag & drop your image'}
                    </p>
                    <p className="text-white/40 text-sm mt-1">or click to browse</p>
                  </div>
                  <p className="text-white/30 text-xs">
                    PNG, JPEG, GIF, WebP, SVG • Max 10MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="rounded-2xl overflow-hidden border border-white/10">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full max-h-96 object-contain bg-[#0a0a1a]"
                  />
                </div>
                <button
                  onClick={removeImage}
                  className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-white/50">{imageFile?.name}</span>
                  <span className="text-white/30">{(imageFile?.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={ipfsCid ? () => setCurrentStep(2) : uploadToIPFS}
                disabled={!canProceedStep1 || uploading}
                className="px-6 py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-purple-500 disabled:hover:to-pink-500 flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Uploading to IPFS...
                  </>
                ) : ipfsCid ? (
                  'Next: Details →'
                ) : (
                  'Upload & Continue →'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Details */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-white/70 text-sm font-semibold mb-2">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter NFT name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-all"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-white/70 text-sm font-semibold mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your NFT (optional)"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-all resize-none"
              />
            </div>

            {/* Attributes */}
            <div>
              <label className="block text-white/70 text-sm font-semibold mb-2">Traits / Attributes</label>
              <div className="space-y-2">
                {attributes.map((attr, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={attr.trait_type}
                      onChange={(e) => updateAttribute(index, 'trait_type', e.target.value)}
                      placeholder="Trait name"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-all"
                    />
                    <input
                      type="text"
                      value={attr.value}
                      onChange={(e) => updateAttribute(index, 'value', e.target.value)}
                      placeholder="Value"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-all"
                    />
                    <button
                      onClick={() => removeAttribute(index)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addAttribute}
                className="mt-2 text-sm text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Trait
              </button>
            </div>

            {/* Royalty */}
            <div>
              <label className="block text-white/70 text-sm font-semibold mb-2">
                Royalty: <span className="text-purple-400">{royalty}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={royalty}
                onChange={(e) => setRoyalty(parseInt(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>0%</span>
                <span>50%</span>
              </div>
              <p className="text-white/40 text-xs mt-1">
                {royalty}% of future sales go to you as creator
              </p>
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-6 py-3 rounded-xl font-semibold transition-all bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
              >
                ← Back
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                disabled={!canProceedStep2}
                className="px-6 py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Review & Mint →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Mint */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {/* Preview Card */}
            <div className="flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-1/2">
                <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#141428]">
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="NFT Preview"
                      className="w-full aspect-square object-cover"
                    />
                  )}
                  <div className="p-4">
                    <h4 className="text-white font-bold text-lg truncate">{name}</h4>
                    {description && (
                      <p className="text-white/50 text-sm mt-1 line-clamp-2">{description}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="w-full md:w-1/2 space-y-4">
                <h3 className="text-white font-bold text-xl">Mint Summary</h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/50 text-sm">Name</span>
                    <span className="text-white font-medium text-sm">{name}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/50 text-sm">Description</span>
                    <span className="text-white/70 text-sm text-right max-w-[200px] truncate">
                      {description || 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/50 text-sm">Traits</span>
                    <span className="text-white/70 text-sm">
                      {attributes.filter((a) => a.trait_type.trim()).length} trait(s)
                    </span>
                  </div>
                  {attributes.filter((a) => a.trait_type.trim() && a.value.trim()).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-2 border-b border-white/5">
                      {attributes
                        .filter((a) => a.trait_type.trim() && a.value.trim())
                        .map((attr, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2 py-0.5 text-xs"
                          >
                            <span className="text-purple-300/60">{attr.trait_type}:</span>
                            <span className="text-purple-200 font-medium">{attr.value}</span>
                          </span>
                        ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/50 text-sm">Royalty</span>
                    <span className="text-purple-400 font-medium text-sm">{royalty}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-white/50 text-sm">Mint Price</span>
                    <span className="text-white font-bold">
                      {Number(mintPrice) === 0 ? 'Free' : `${mintPrice} ETH`}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-6 py-3 rounded-xl font-semibold transition-all bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
              >
                ← Back
              </button>
              <button
                onClick={handleMint}
                disabled={!canMint || minting || contract?.loading}
                className="px-8 py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {minting || contract?.loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Minting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Mint NFT
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MintForm;
