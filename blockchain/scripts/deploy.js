/**
 * @file deploy.js
 * @description Deployment script for NFTMinter and NFTMarketplace contracts.
 *              Deploys both contracts, verifies on Etherscan, and logs
 *              all addresses for frontend/server configuration.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network localhost
 */

const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log('═'.repeat(60));
  console.log('  NFT DApp — Contract Deployment');
  console.log('═'.repeat(60));
  console.log(`  Network:  ${hre.network.name}`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Balance:  ${hre.ethers.formatEther(balance)} ETH`);
  console.log('─'.repeat(60));

  // ── Deploy NFTMinter ──────────────────────────────────────────
  console.log('\n📦 Deploying NFTMinter...');
  const NFTMinter = await hre.ethers.getContractFactory('NFTMinter');
  const nft = await NFTMinter.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`  ✅ NFTMinter deployed: ${nftAddress}`);

  // ── Deploy NFTMarketplace ─────────────────────────────────────
  console.log('\n📦 Deploying NFTMarketplace...');
  const NFTMarketplace = await hre.ethers.getContractFactory('NFTMarketplace');
  const marketplace = await NFTMarketplace.deploy();
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`  ✅ NFTMarketplace deployed: ${marketplaceAddress}`);

  // ── Log Configuration ─────────────────────────────────────────
  const balanceAfter = await hre.ethers.provider.getBalance(deployer.address);
  const deploymentCost = balance - balanceAfter;

  console.log('\n' + '═'.repeat(60));
  console.log('  DEPLOYMENT COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  NFTMinter:       ${nftAddress}`);
  console.log(`  NFTMarketplace:  ${marketplaceAddress}`);
  console.log(`  Deployment cost: ${hre.ethers.formatEther(deploymentCost)} ETH`);
  console.log('─'.repeat(60));
  console.log('\n  📋 Update these addresses in:');
  console.log('     • client/src/utils/constants.js');
  console.log('     • server/.env');
  console.log('');

  // ── Etherscan Verification ────────────────────────────────────
  if (hre.network.name !== 'hardhat' && hre.network.name !== 'localhost') {
    console.log('⏳ Waiting 30s for Etherscan indexing...');
    await new Promise((r) => setTimeout(r, 30000));

    try {
      console.log('\n🔍 Verifying NFTMinter on Etherscan...');
      await hre.run('verify:verify', {
        address: nftAddress,
        constructorArguments: [],
      });
      console.log('  ✅ NFTMinter verified');
    } catch (err) {
      if (err.message.includes('Already Verified')) {
        console.log('  ℹ️  NFTMinter already verified');
      } else {
        console.error('  ❌ NFTMinter verification failed:', err.message);
      }
    }

    try {
      console.log('\n🔍 Verifying NFTMarketplace on Etherscan...');
      await hre.run('verify:verify', {
        address: marketplaceAddress,
        constructorArguments: [],
      });
      console.log('  ✅ NFTMarketplace verified');
    } catch (err) {
      if (err.message.includes('Already Verified')) {
        console.log('  ℹ️  NFTMarketplace already verified');
      } else {
        console.error('  ❌ NFTMarketplace verification failed:', err.message);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
