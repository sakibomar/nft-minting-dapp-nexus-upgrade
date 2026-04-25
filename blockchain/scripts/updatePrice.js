const hre = require("hardhat");

async function main() {
  const contract = await hre.ethers.getContractAt(
    "NFTMinter",
    "0x18bB856968a9457e0B56380A7c084A43269A678f"
  );

  const newPrice = hre.ethers.parseEther("0.001");
  const tx = await contract.updateMintPrice(newPrice);
  await tx.wait();

  console.log("✅ Mint price updated to 0.001 ETH");
}

main().catch(console.error);