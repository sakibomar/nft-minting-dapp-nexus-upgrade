/**
 * @file transferOwnership.js
 * @description Transfer contract ownership to a new address.
 *
 * Usage:
 *   npx hardhat run scripts/transferOwnership.js --network sepolia
 *
 * Change CURRENT_OWNER_ADDRESS and NEW_OWNER_ADDRESS as needed.
 */

const hre = require('hardhat');

async function main() {
  // ⚠️ SET THESE VALUES:
  const CONTRACT_ADDRESS = '0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738'; // NFTMinter
  const NEW_OWNER_ADDRESS = '0xf2f8f7e122b7f80aa364cff7b978d4bf44ed9b06'; // Your MetaMask address

  console.log('═'.repeat(60));
  console.log('  Transfer Contract Ownership');
  console.log('═'.repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  console.log(`  Current signer: ${deployer.address}`);
  console.log(`  Target owner: ${NEW_OWNER_ADDRESS}`);
  console.log('─'.repeat(60));

  // Get contract
  const NFTMinter = await hre.ethers.getContractFactory('NFTMinter');
  const nft = NFTMinter.attach(CONTRACT_ADDRESS);

  // Check current owner
  const currentOwner = await nft.owner();
  console.log(`\n  ✓ Current owner: ${currentOwner}`);

  if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error('\n  ❌ ERROR: Only the current owner can transfer ownership!');
    console.error(`     Your signer (${deployer.address}) is not the owner.`);
    console.error(`     Current owner is: ${currentOwner}`);
    process.exit(1);
  }

  // Transfer ownership
  console.log(`\n  📋 Transferring ownership to ${NEW_OWNER_ADDRESS}...`);
  const tx = await nft.transferOwnership(NEW_OWNER_ADDRESS);
  const receipt = await tx.wait();

  console.log(`\n  ✅ Ownership transferred!`);
  console.log(`  Transaction: ${receipt.hash}`);
  console.log(`  New owner: ${NEW_OWNER_ADDRESS}`);
  console.log('═'.repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
