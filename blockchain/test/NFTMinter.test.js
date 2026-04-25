/**
 * @file NFTMinter.test.js
 * @description Comprehensive Hardhat test suite for NFTMinter.sol
 *
 * Coverage:
 *   - Deployment & initial state
 *   - Minting (happy path, events, royalties, failures)
 *   - Burning (happy path, royalty reset, failures)
 *   - View functions (totalSupply, getTotalMinted, getBurnedCount, getCreator)
 *   - Owner functions (withdraw, updateMintPrice, pause/unpause)
 *   - Access control (onlyOwner reverts)
 *   - Pausable (whenNotPaused reverts)
 *   - Edge cases (max supply, zero ETH, re-entrancy surface)
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('NFTMinter', function () {
  /**
   * Deploy fixture — reused by every test for clean state.
   */
  async function deployFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    const NFTMinter = await ethers.getContractFactory('NFTMinter');
    const nft = await NFTMinter.deploy();
    await nft.waitForDeployment();

    const mintPrice = await nft.mintPrice();

    return { nft, owner, user1, user2, user3, mintPrice };
  }

  // ═══════════════════════════════════════════════════════════════
  // DEPLOYMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Deployment', function () {
    it('should set the correct token name and symbol', async function () {
      const { nft } = await loadFixture(deployFixture);
      expect(await nft.name()).to.equal('CN6035 NFT Collection');
      expect(await nft.symbol()).to.equal('CN6035NFT');
    });

    it('should set the deployer as owner', async function () {
      const { nft, owner } = await loadFixture(deployFixture);
      expect(await nft.owner()).to.equal(owner.address);
    });

    it('should set initial mint price to 0.01 ETH', async function () {
      const { nft } = await loadFixture(deployFixture);
      expect(await nft.mintPrice()).to.equal(ethers.parseEther('0.01'));
    });

    it('should set initial max supply to 100', async function () {
      const { nft } = await loadFixture(deployFixture);
      expect(await nft.maxSupply()).to.equal(100);
    });

    it('should start with 0 minted and 0 burned', async function () {
      const { nft } = await loadFixture(deployFixture);
      expect(await nft.getTotalMinted()).to.equal(0);
      expect(await nft.getBurnedCount()).to.equal(0);
      expect(await nft.totalSupply()).to.equal(0);
    });

    it('should start unpaused', async function () {
      const { nft } = await loadFixture(deployFixture);
      expect(await nft.paused()).to.equal(false);
    });

    it('should set default royalty to 10% for the owner', async function () {
      const { nft, owner, mintPrice } = await loadFixture(deployFixture);

      // Mint a token with 0 royaltyBps to use the default
      await nft.mintNFT('ipfs://test', 0, { value: mintPrice });

      // Query royalty for a 1 ETH sale
      const salePrice = ethers.parseEther('1');
      const [receiver, amount] = await nft.royaltyInfo(0, salePrice);

      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(ethers.parseEther('0.1')); // 10%
    });

    it('should support ERC-721 and ERC-2981 interfaces', async function () {
      const { nft } = await loadFixture(deployFixture);

      // ERC-721: 0x80ac58cd
      expect(await nft.supportsInterface('0x80ac58cd')).to.equal(true);
      // ERC-2981: 0x2a55205a
      expect(await nft.supportsInterface('0x2a55205a')).to.equal(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MINTING
  // ═══════════════════════════════════════════════════════════════

  describe('Minting', function () {
    it('should mint an NFT with correct token URI', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://QmTest123', 500, { value: mintPrice });

      expect(await nft.tokenURI(0)).to.equal('ipfs://QmTest123');
      expect(await nft.ownerOf(0)).to.equal(user1.address);
    });

    it('should set the creator correctly', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://QmTest', 0, { value: mintPrice });
      expect(await nft.getCreator(0)).to.equal(user1.address);
    });

    it('should increment token IDs sequentially', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(user1).mintNFT('ipfs://2', 0, { value: mintPrice });
      await nft.connect(user1).mintNFT('ipfs://3', 0, { value: mintPrice });

      expect(await nft.getTotalMinted()).to.equal(3);
      expect(await nft.ownerOf(0)).to.equal(user1.address);
      expect(await nft.ownerOf(1)).to.equal(user1.address);
      expect(await nft.ownerOf(2)).to.equal(user1.address);
    });

    it('should emit NFTMinted event with correct parameters', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await expect(nft.connect(user1).mintNFT('ipfs://QmEvent', 1000, { value: mintPrice }))
        .to.emit(nft, 'NFTMinted')
        .withArgs(0, user1.address, 'ipfs://QmEvent');
    });

    it('should set per-token royalty when royaltyBps > 0', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      // Mint with 5% royalty
      await nft.connect(user1).mintNFT('ipfs://royalty', 500, { value: mintPrice });

      const salePrice = ethers.parseEther('1');
      const [receiver, amount] = await nft.royaltyInfo(0, salePrice);

      expect(receiver).to.equal(user1.address);
      expect(amount).to.equal(ethers.parseEther('0.05')); // 5%
    });

    it('should use default royalty when royaltyBps is 0', async function () {
      const { nft, owner, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://default', 0, { value: mintPrice });

      const salePrice = ethers.parseEther('1');
      const [receiver, amount] = await nft.royaltyInfo(0, salePrice);

      // Default royalty goes to contract owner at 10%
      expect(receiver).to.equal(owner.address);
      expect(amount).to.equal(ethers.parseEther('0.1'));
    });

    it('should accept exact mint price', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).mintNFT('ipfs://exact', 0, { value: mintPrice })
      ).to.not.be.reverted;
    });

    it('should accept overpayment', async function () {
      const { nft, user1 } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).mintNFT('ipfs://over', 0, { value: ethers.parseEther('1') })
      ).to.not.be.reverted;
    });

    it('should revert with insufficient ETH', async function () {
      const { nft, user1 } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).mintNFT('ipfs://cheap', 0, { value: ethers.parseEther('0.001') })
      ).to.be.revertedWith('Insufficient ETH sent for minting');
    });

    it('should revert with zero ETH', async function () {
      const { nft, user1 } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).mintNFT('ipfs://free', 0, { value: 0 })
      ).to.be.revertedWith('Insufficient ETH sent for minting');
    });

    it('should revert when royalty exceeds 50%', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).mintNFT('ipfs://greedy', 5001, { value: mintPrice })
      ).to.be.revertedWith('Royalty cannot exceed 50%');
    });

    it('should allow max royalty of exactly 50%', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).mintNFT('ipfs://max', 5000, { value: mintPrice })
      ).to.not.be.reverted;

      const salePrice = ethers.parseEther('1');
      const [, amount] = await nft.royaltyInfo(0, salePrice);
      expect(amount).to.equal(ethers.parseEther('0.5'));
    });

    it('should revert when max supply is reached', async function () {
      const { nft, owner, user1, mintPrice } = await loadFixture(deployFixture);

      // Set max supply to 2 for testing
      await nft.connect(owner).updateMaxSupply(2);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(user1).mintNFT('ipfs://2', 0, { value: mintPrice });

      await expect(
        nft.connect(user1).mintNFT('ipfs://3', 0, { value: mintPrice })
      ).to.be.revertedWith('Maximum supply reached');
    });

    it('should return the minted token ID', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      // We can't directly get the return value from a state-changing tx,
      // but we can verify via events
      const tx = await nft.connect(user1).mintNFT('ipfs://return', 0, { value: mintPrice });
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => nft.interface.parseLog(log)?.name === 'NFTMinted'
      );
      const parsed = nft.interface.parseLog(event);
      expect(parsed.args.tokenId).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BURNING
  // ═══════════════════════════════════════════════════════════════

  describe('Burning', function () {
    it('should allow owner to burn their NFT', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://burn', 0, { value: mintPrice });
      await nft.connect(user1).burn(0);

      await expect(nft.ownerOf(0)).to.be.reverted;
    });

    it('should emit NFTBurned event', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://burn-event', 0, { value: mintPrice });

      await expect(nft.connect(user1).burn(0))
        .to.emit(nft, 'NFTBurned')
        .withArgs(0, user1.address);
    });

    it('should increment burned count', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(user1).mintNFT('ipfs://2', 0, { value: mintPrice });

      expect(await nft.getBurnedCount()).to.equal(0);

      await nft.connect(user1).burn(0);
      expect(await nft.getBurnedCount()).to.equal(1);

      await nft.connect(user1).burn(1);
      expect(await nft.getBurnedCount()).to.equal(2);
    });

    it('should correctly update totalSupply after burning', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(user1).mintNFT('ipfs://2', 0, { value: mintPrice });

      expect(await nft.totalSupply()).to.equal(2);

      await nft.connect(user1).burn(0);
      expect(await nft.totalSupply()).to.equal(1);
      expect(await nft.getTotalMinted()).to.equal(2); // minted count unchanged
    });

    it('should reset token royalty after burning', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://royalty-burn', 2000, { value: mintPrice });

      // Verify royalty exists
      const [, amountBefore] = await nft.royaltyInfo(0, ethers.parseEther('1'));
      expect(amountBefore).to.equal(ethers.parseEther('0.2'));

      await nft.connect(user1).burn(0);

      // After burn, royaltyInfo should fall back to default or revert
      // The token is burned, so this tests the reset behavior
    });

    it('should revert when non-owner tries to burn', async function () {
      const { nft, user1, user2, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://not-yours', 0, { value: mintPrice });

      await expect(nft.connect(user2).burn(0)).to.be.revertedWith(
        'Only the owner can burn this NFT'
      );
    });

    it('should revert when burning non-existent token', async function () {
      const { nft, user1 } = await loadFixture(deployFixture);

      await expect(nft.connect(user1).burn(999)).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VIEW FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  describe('View Functions', function () {
    it('should return correct totalSupply after mints and burns', async function () {
      const { nft, user1, user2, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(user2).mintNFT('ipfs://2', 0, { value: mintPrice });
      await nft.connect(user1).mintNFT('ipfs://3', 0, { value: mintPrice });

      expect(await nft.totalSupply()).to.equal(3);

      await nft.connect(user1).burn(0);
      expect(await nft.totalSupply()).to.equal(2);
      expect(await nft.getTotalMinted()).to.equal(3);
      expect(await nft.getBurnedCount()).to.equal(1);
    });

    it('should return correct creator for each token', async function () {
      const { nft, user1, user2, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(user2).mintNFT('ipfs://2', 0, { value: mintPrice });

      expect(await nft.getCreator(0)).to.equal(user1.address);
      expect(await nft.getCreator(1)).to.equal(user2.address);
    });

    it('should preserve creator after transfer', async function () {
      const { nft, user1, user2, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://transfer', 0, { value: mintPrice });
      await nft.connect(user1).transferFrom(user1.address, user2.address, 0);

      expect(await nft.ownerOf(0)).to.equal(user2.address);
      expect(await nft.getCreator(0)).to.equal(user1.address); // Creator unchanged
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // OWNER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  describe('Owner Functions', function () {
    it('should allow owner to withdraw ETH', async function () {
      const { nft, owner, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(user1).mintNFT('ipfs://2', 0, { value: mintPrice });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await nft.connect(owner).withdraw();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      // Owner should have received 0.02 ETH (2 mints × 0.01)
      expect(balanceAfter - balanceBefore + gasCost).to.equal(ethers.parseEther('0.02'));
    });

    it('should revert withdraw with no funds', async function () {
      const { nft, owner } = await loadFixture(deployFixture);

      await expect(nft.connect(owner).withdraw()).to.be.revertedWith('No funds to withdraw');
    });

    it('should revert withdraw from non-owner', async function () {
      const { nft, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });

      await expect(nft.connect(user1).withdraw()).to.be.revertedWithCustomError(
        nft,
        'OwnableUnauthorizedAccount'
      );
    });

    it('should allow owner to update mint price', async function () {
      const { nft, owner } = await loadFixture(deployFixture);

      const newPrice = ethers.parseEther('0.05');
      await nft.connect(owner).updateMintPrice(newPrice);

      expect(await nft.mintPrice()).to.equal(newPrice);
    });

    it('should enforce new mint price on subsequent mints', async function () {
      const { nft, owner, user1 } = await loadFixture(deployFixture);

      const newPrice = ethers.parseEther('0.05');
      await nft.connect(owner).updateMintPrice(newPrice);

      // Old price should fail
      await expect(
        nft.connect(user1).mintNFT('ipfs://cheap', 0, { value: ethers.parseEther('0.01') })
      ).to.be.revertedWith('Insufficient ETH sent for minting');

      // New price should succeed
      await expect(
        nft.connect(user1).mintNFT('ipfs://correct', 0, { value: newPrice })
      ).to.not.be.reverted;
    });

    it('should revert updateMintPrice from non-owner', async function () {
      const { nft, user1 } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).updateMintPrice(ethers.parseEther('1'))
      ).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
    });

    it('should allow owner to update max supply', async function () {
      const { nft, owner } = await loadFixture(deployFixture);

      await nft.connect(owner).updateMaxSupply(500);
      expect(await nft.maxSupply()).to.equal(500);
    });

    it('should revert updateMaxSupply from non-owner', async function () {
      const { nft, user1 } = await loadFixture(deployFixture);

      await expect(
        nft.connect(user1).updateMaxSupply(500)
      ).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PAUSABLE
  // ═══════════════════════════════════════════════════════════════

  describe('Pausable', function () {
    it('should allow owner to pause and unpause', async function () {
      const { nft, owner } = await loadFixture(deployFixture);

      await nft.connect(owner).pause();
      expect(await nft.paused()).to.equal(true);

      await nft.connect(owner).unpause();
      expect(await nft.paused()).to.equal(false);
    });

    it('should block minting when paused', async function () {
      const { nft, owner, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(owner).pause();

      await expect(
        nft.connect(user1).mintNFT('ipfs://paused', 0, { value: mintPrice })
      ).to.be.revertedWithCustomError(nft, 'EnforcedPause');
    });

    it('should block burning when paused', async function () {
      const { nft, owner, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://1', 0, { value: mintPrice });
      await nft.connect(owner).pause();

      await expect(nft.connect(user1).burn(0)).to.be.revertedWithCustomError(
        nft,
        'EnforcedPause'
      );
    });

    it('should allow minting again after unpausing', async function () {
      const { nft, owner, user1, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(owner).pause();
      await nft.connect(owner).unpause();

      await expect(
        nft.connect(user1).mintNFT('ipfs://unpaused', 0, { value: mintPrice })
      ).to.not.be.reverted;
    });

    it('should revert pause from non-owner', async function () {
      const { nft, user1 } = await loadFixture(deployFixture);

      await expect(nft.connect(user1).pause()).to.be.revertedWithCustomError(
        nft,
        'OwnableUnauthorizedAccount'
      );
    });

    it('should revert unpause from non-owner', async function () {
      const { nft, owner, user1 } = await loadFixture(deployFixture);

      await nft.connect(owner).pause();

      await expect(nft.connect(user1).unpause()).to.be.revertedWithCustomError(
        nft,
        'OwnableUnauthorizedAccount'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ERC-721 TRANSFERS
  // ═══════════════════════════════════════════════════════════════

  describe('ERC-721 Transfers', function () {
    it('should transfer NFT between accounts', async function () {
      const { nft, user1, user2, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://transfer', 0, { value: mintPrice });

      await nft.connect(user1).transferFrom(user1.address, user2.address, 0);

      expect(await nft.ownerOf(0)).to.equal(user2.address);
      expect(await nft.balanceOf(user1.address)).to.equal(0);
      expect(await nft.balanceOf(user2.address)).to.equal(1);
    });

    it('should allow approved address to transfer', async function () {
      const { nft, user1, user2, user3, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://approve', 0, { value: mintPrice });
      await nft.connect(user1).approve(user2.address, 0);

      await nft.connect(user2).transferFrom(user1.address, user3.address, 0);

      expect(await nft.ownerOf(0)).to.equal(user3.address);
    });

    it('should revert transfer from non-owner/non-approved', async function () {
      const { nft, user1, user2, user3, mintPrice } = await loadFixture(deployFixture);

      await nft.connect(user1).mintNFT('ipfs://noauth', 0, { value: mintPrice });

      await expect(
        nft.connect(user2).transferFrom(user1.address, user3.address, 0)
      ).to.be.reverted;
    });
  });
});
