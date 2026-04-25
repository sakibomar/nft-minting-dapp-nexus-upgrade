# NFT Minting & Marketplace Platform

![Build](https://img.shields.io/badge/build-112%20passing-brightgreen)
![Solidity](https://img.shields.io/badge/solidity-0.8.28-363636)
![Coverage](https://img.shields.io/badge/coverage-112%20Hardhat%20tests-brightgreen)
![Network](https://img.shields.io/badge/network-Sepolia-6A5ACD)
![License](https://img.shields.io/badge/license-not%20specified-lightgrey)

## Coursework Context

| Field | Value |
| --- | --- |
| Module | `CN6035 - Full-Stack Blockchain Development` |
| Student ID | `U2643145` |
| Project | `Hybrid DApp Development: NFT Minting & Marketplace Platform` |
| Assessment Context | `Task 1 - Technical Report` |
| Network | `Ethereum Sepolia Testnet (Chain ID 11155111)` |

This repository implements a hybrid DApp for minting, cataloguing, and trading ERC-721 NFTs on Ethereum Sepolia. Token ownership, escrow, bids, offers, auction settlement, and royalty distribution are enforced on-chain by two Solidity contracts. Metadata pinning, cached reads, IPFS proxying, transaction history aggregation, and real-time event fan-out are handled by an Express/Socket.IO service. The client is a React single-page application that uses MetaMask through the EIP-1193 provider interface for all state-changing transactions.

## 🎬 Presentation and Demo

**Live Video Demo:** [https://youtu.be/5eIeuYzYGqQ](https://youtu.be/5eIeuYzYGqQ)

This video demonstrates:
- Live wallet connection and NFT minting workflow
- Marketplace listing creation and offer/bid management
- Admin controls and transaction history
- Real-time Socket.IO event streaming
- Asset gallery navigation and filtering
- Complete end-to-end user journey

## 📖 Quick Start Guide

**→ [See INSTALLATION_MANUAL.md](INSTALLATION_MANUAL.md) for step-by-step setup and deployment instructions**

This comprehensive guide covers:
- Environment configuration
- Local blockchain setup
- Smart contract deployment
- Server and client initialization
- Troubleshooting and common issues

## Architecture Overview

| Tier | Location | Responsibility | Trust Boundary |
| --- | --- | --- | --- |
| Client | `client/` | Wallet connection, route rendering, mint/list/bid/offer workflows, gallery/search/filter UI, admin controls, history views, Socket.IO subscription | Untrusted presentation layer; signs transactions through MetaMask |
| Server | `server/` | REST API, Pinata upload proxy, IPFS gateway proxy, route caching, event indexing, Socket.IO broadcast, history aggregation, health checks | Trusted for availability, caching, upload orchestration, and read aggregation |
| Blockchain | `blockchain/` | NFT minting, ownership, royalties, escrow, listings, auctions, offers, payment settlement, pause controls | Trust-minimized execution and state |

### Runtime Flow

1. The client uploads media and metadata to the server.
2. The server pins content to Pinata and returns a token URI.
3. The client submits signed transactions directly to Sepolia through MetaMask.
4. The server polls contract events in CU-budget-aware chunks, updates its event store, invalidates caches, and broadcasts Socket.IO events.
5. The client refreshes affected views from REST endpoints and renders the new on-chain state.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `blockchain/contracts/` | `NFTMinter.sol` and `NFTMarketplace.sol` |
| `blockchain/scripts/` | deployment and operational scripts |
| `blockchain/test/` | Hardhat contract test suite |
| `server/src/routes/` | six REST route modules |
| `server/src/cache/` | in-memory and persisted event cache |
| `server/src/utils/` | IPFS resolution, caching, helper utilities |
| `client/src/components/` | application pages, dialogs, cards, admin panel |
| `client/src/hooks/` | wallet, contract, marketplace, socket, and favorites hooks |
| `client/src/utils/` | addresses, ABIs, helpers, API resolution |

## Application Dependencies

### Root Workspace

| Package | Version | Purpose |
| --- | --- | --- |
| `eslint` | `8.57.1` | JavaScript and JSX linting |
| `eslint-plugin-react` | `7.37.5` | React lint rules |
| `prettier` | `3.8.1` | formatting |
| `solhint` | `4.5.4` | Solidity linting |

### Blockchain Workspace (`blockchain/`)

| Package | Version | Purpose |
| --- | --- | --- |
| `hardhat` | `2.28.6` | contract compilation, testing, deployment |
| `@nomicfoundation/hardhat-toolbox` | `4.0.0` | Hardhat plugins, Mocha/Chai, helpers |
| `@nomicfoundation/hardhat-verify` | `2.0.13` | Etherscan verification |
| `@openzeppelin/contracts` | `5.6.1` | ERC-721, ERC-2981, Ownable, Pausable, ReentrancyGuard |
| `dotenv` | `16.6.1` | environment variable loading |

### Server Workspace (`server/`)

| Package | Version | Purpose |
| --- | --- | --- |
| `express` | `4.22.1` | HTTP API server |
| `cors` | `2.8.6` | cross-origin request handling |
| `dotenv` | `16.6.1` | environment variable loading |
| `ethers` | `6.16.0` | contract reads, event polling, formatting |
| `helmet` | `7.2.0` | HTTP security headers |
| `morgan` | `1.10.1` | request logging |
| `express-rate-limit` | `7.5.1` | API throttling |
| `multer` | `1.4.5-lts.2` | multipart image upload handling |
| `axios` | `1.14.0` | outbound HTTP calls to Pinata and gateways |
| `form-data` | `4.0.5` | multipart payload construction |
| `socket.io` | `4.8.3` | real-time event broadcast |
| `nodemon` | `3.0.0` | local server development runner |

### Client Workspace (`client/`)

| Package | Version | Purpose |
| --- | --- | --- |
| `react` | `18.3.1` | UI runtime |
| `react-dom` | `18.3.1` | DOM rendering |
| `react-router-dom` | `6.30.3` | SPA routing |
| `react-hot-toast` | `2.6.0` | toast notifications |
| `recharts` | `2.15.4` | price and activity charts |
| `ethers` | `6.16.0` | wallet and contract interaction |
| `socket.io-client` | `4.8.3` | real-time updates |
| `vite` | `5.4.21` | frontend dev server and build |
| `@vitejs/plugin-react` | `4.7.0` | Vite React integration |
| `tailwindcss` | `3.4.19` | utility-first styling |
| `postcss` | `8.4.32` | CSS processing |
| `autoprefixer` | `10.4.16` | CSS vendor prefixing |
| `@types/react` | `18.2.0` | React editor types |
| `@types/react-dom` | `18.2.0` | React DOM editor types |

## Deployment Summary

### Sepolia Contracts

| Contract | Address | Explorer |
| --- | --- | --- |
| `NFTMinter` | `0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738` | `https://sepolia.etherscan.io/address/0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738` |
| `NFTMarketplace` | `0x45F9EC0878f1236E4705C23099CaF6315C61D2dA` | `https://sepolia.etherscan.io/address/0x45F9EC0878f1236E4705C23099CaF6315C61D2dA` |

### Contract Defaults

| Item | Value |
| --- | --- |
| Network | Ethereum Sepolia |
| Chain ID | `11155111` |
| Compiler | Solidity `0.8.28` |
| EVM target | `cancun` |
| Optimizer | enabled, `200` runs |
| NFT collection name | `CN6035 NFT Collection` |
| NFT symbol | `CN6035NFT` |
| Initial mint price | `0.01 ETH` |
| Initial max supply | `100` |
| Default royalty | `10%` to contract owner when per-token royalty is `0` |
| Auction duration bounds | `1 hour` to `30 days` |

## Prerequisites

The local workflow below is validated against the currently installed toolchain in this repository.

| Component | Exact Version |
| --- | --- |
| Node.js | `24.13.1` |
| npm | `11.8.0` |
| Hardhat | `2.28.6` |
| Solidity compiler | `0.8.28` |
| OpenZeppelin Contracts | `5.6.1` |
| Express | `4.22.1` |
| Ethers.js | `6.16.0` |
| Socket.IO / client | `4.8.3` |
| React | `18.3.1` |
| React Router | `6.30.3` |
| Vite | `5.4.21` |
| Tailwind CSS | `3.4.19` |
| MetaMask | current desktop extension with Sepolia enabled |

External accounts required for the full workflow:

- Alchemy or equivalent Sepolia RPC provider
- Pinata account for image and metadata pinning
- Etherscan API key for verification during deployment
- MetaMask wallet funded with Sepolia ETH

## Local Setup

These steps run the application locally while targeting the existing Sepolia deployment.

1. Clone the repository and enter the workspace.

   ```bash
   git clone <repository-url>
   cd nft-minting-dapp-NEXUS-UPGRADE
   ```

2. Install root tooling and workspace dependencies.

   ```bash
   npm install
   npm run install:all
   ```

   Equivalent manual workspace installation:

   ```bash
   cd blockchain
   npm install
   cd ../server
   npm install
   cd ../client
   npm install
   ```

3. Create or update the environment files described in the tables below.

   - `blockchain/.env`
   - `server/.env`
   - optionally `client/.env`

4. Compile the contracts.

   ```bash
   npm run compile
   ```

5. Start the API server.

   ```bash
   npm run start:server
   ```

   The server listens on `http://localhost:5000` by default.
   Equivalent direct commands:

   ```bash
   cd server
   npm run dev
   ```

   or

   ```bash
   cd server
   npm start
   ```

6. Start the client in a second terminal.

   ```bash
   npm run start:client
   ```

   The Vite dev server listens on `http://localhost:3000`.
   Equivalent direct command:

   ```bash
   cd client
   npm run dev
   ```

7. Open `http://localhost:3000`, connect MetaMask, and switch to Sepolia when prompted.

### Optional: Run Against a Local Hardhat Chain

The repository also supports a local chain workflow, but the contract addresses in the client are hardcoded to Sepolia. To use localhost end to end:

1. Start a local node.

   ```bash
   npm run start:node
   ```

2. Deploy both contracts locally.

   ```bash
   npm run deploy:local
   ```

3. Set `server/.env` `RPC_URL=http://127.0.0.1:8545`.
4. Replace the contract addresses in `client/src/utils/constants.js` and `server/.env` with the deployment output from `blockchain/scripts/deploy.js`.
5. Add the local Hardhat network to MetaMask before using the client.

## Testing

Run the full Hardhat test suite to verify contract functionality:

```bash
npm run test
```

or from the `blockchain/` directory:

```bash
cd blockchain
npm test
```

### Test Results

**✅ All 112 tests passing (6s)**

#### NFTMarketplace (62 tests)
- Deployment & ownership
- Fixed-price listings (creation, purchase, cancellation)
- Listing price updates
- English auctions (bidding, settlement, cancellation)
- Offer system (creation, acceptance, cancellation)
- View functions (listing IDs, counts)
- Pausable functionality
- ERC-2981 royalty enforcement

#### NFTMinter (50 tests)
- Deployment & token configuration
- Minting with sequential token IDs and creator tracking
- Burning with supply updates
- Royalty management (per-token and default)
- Owner functions (withdraw, price updates, max supply)
- Pausable minting and burning
- ERC-721 transfers and approvals

## Environment Variables

### Blockchain (`blockchain/.env`)

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `SEPOLIA_RPC_URL` | Yes for Sepolia deploy/verify | Sepolia JSON-RPC endpoint used by Hardhat scripts | `https://eth-sepolia.g.alchemy.com/v2/<alchemy-key>` |
| `PRIVATE_KEY` | Yes for Sepolia deploy/admin scripts | Deployer account private key | `0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |
| `ETHERSCAN_API_KEY` | Optional | Required for automatic or manual Etherscan verification | `<etherscan-api-key>` |

### Server (`server/.env`)

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `PORT` | Optional | Express server port. Defaults to `5000`. | `5000` |
| `RPC_URL` | Yes | RPC endpoint used for all read-side chain access and event polling | `https://eth-sepolia.g.alchemy.com/v2/<alchemy-key>` |
| `CONTRACT_ADDRESS` | Optional if using bundled Sepolia defaults | NFT contract address used by the API server | `0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738` |
| `MARKETPLACE_ADDRESS` | Optional if using bundled Sepolia defaults | Marketplace contract address used by the API server | `0x45F9EC0878f1236E4705C23099CaF6315C61D2dA` |
| `NODE_ENV` | Optional | Runtime mode used by error handling and rate-limit defaults | `development` |
| `PINATA_API_KEY` | Required for upload routes | Pinata API key for image and metadata pinning | `<pinata-api-key>` |
| `PINATA_SECRET_KEY` | Required for upload routes | Pinata API secret key | `<pinata-secret-api-key>` |
| `PINATA_GATEWAY_URL` | Recommended | Dedicated Pinata gateway used for IPFS resolution before public fallbacks | `https://<subdomain>.mypinata.cloud` |
| `PINATA_GATEWAY_KEY` | Optional | Gateway auth key if the dedicated gateway is protected | `<pinata-gateway-key>` |
| `API_RATE_LIMIT_MAX` | Optional | Maximum requests per IP per 15-minute window | `2000` |
| `ENABLE_API_RATE_LIMIT` | Optional | Explicitly enable or disable API rate limiting | `false` |
| `RPC_NETWORK` | Optional | Static network hint passed to the provider | `sepolia` |
| `HISTORY_CONTRACT_SCAN_DEPTH` | Optional | Direct contract log scan depth for history fallback | `30` |
| `HISTORY_CONTRACT_SCAN_TIMEOUT_MS` | Optional | Timeout for contract history fallback scans | `10000` |
| `HISTORY_FALLBACK_DEPTH` | Optional | Secondary fallback depth when the primary transfer path is unavailable | `500` |

### Client (`client/.env`)

| Variable | Required | Description | Example |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | Optional | Explicit API origin. Leave empty in local dev to use the Vite proxy. | `http://localhost:5000` |
| `VITE_SOCKET_URL` | Optional | Explicit Socket.IO origin. Defaults to `VITE_API_BASE_URL`. | `http://localhost:5000` |
| `VITE_SOCKET_PATH` | Optional | Socket.IO path. Defaults to `/socket.io`. | `/socket.io` |
| `VITE_API_PROXY_TARGET` | Optional | Vite dev proxy target for `/api` and `/socket.io` | `http://localhost:5000` |

## API Surface

Top-level health check:

- `GET /api/health`

Route modules:

| Module | Base Path | Endpoints | Responsibility |
| --- | --- | --- | --- |
| NFT routes | `/api/nfts` | `GET /`<br>`GET /total`<br>`GET /stats`<br>`GET /owner/:address`<br>`GET /:tokenId`<br>`GET /:tokenId/royalty`<br>`POST /metadata`<br>`POST /cache/clear` | Enumerate minted NFTs, resolve metadata, return owner and royalty information, persist local metadata, and clear collection caches |
| Marketplace routes | `/api/marketplace` | `GET /listings`<br>`GET /listings/active`<br>`GET /listings/:listingId`<br>`GET /listings/:listingId/bids`<br>`POST /cache/clear` | Return enriched listing data, active listings, individual listing detail, bid history, and invalidate marketplace caches |
| History routes | `/api/history` | `GET /`<br>`GET /:tokenId`<br>`POST /cache/clear` | Aggregate token and address history from the event store and Alchemy transfer data |
| Offer routes | `/api/offers` | `GET /token/:tokenId`<br>`GET /buyer/:address`<br>`GET /:offerId`<br>`GET /` | Return active offers for a token, buyer, or offer ID and expose total offer count |
| Upload routes | `/api/upload` | `POST /image`<br>`POST /metadata`<br>`POST /seed`<br>`GET /test` | Upload images, pin metadata JSON, seed the local IPFS cache, and verify Pinata configuration |
| IPFS routes | `/api/ipfs` | `GET /:cid`<br>`DELETE /refresh/:cid`<br>`GET /refresh/:tokenId` | Proxy IPFS content through the server, clear cached CIDs, and force metadata refresh for a token |

## Socket.IO Channels

The client subscribes to the following 12 application channels.

| Channel | Source Event | Payload Summary |
| --- | --- | --- |
| `nft:minted` | `NFTMinted` | `tokenId`, `minter`, `tokenURI` |
| `nft:burned` | `NFTBurned` | `tokenId`, `burner` |
| `nft:transfer` | `Transfer` | `from`, `to`, `tokenId` |
| `marketplace:listed` | `Listed` | `listingId`, `seller`, `tokenId`, `price`, `isAuction`, `auctionEndTime` |
| `marketplace:sale` | `Sale` | `listingId`, `buyer`, `tokenId`, `price` |
| `marketplace:bid` | `BidPlaced` | `listingId`, `bidder`, `amount` |
| `marketplace:settled` | `AuctionSettled` | `listingId`, `winner`, `amount` |
| `marketplace:cancelled` | `ListingCancelled` | `listingId` |
| `marketplace:priceUpdated` | `ListingPriceUpdated` | `listingId`, `oldPrice`, `newPrice` |
| `offer:made` | `OfferMade` | `offerId`, `buyer`, `tokenId`, `amount`, `expiresAt` |
| `offer:accepted` | `OfferAccepted` | `offerId`, `seller`, `buyer`, `tokenId`, `amount` |
| `offer:cancelled` | `OfferCancelled` | `offerId` |

Note: the server also emits `offer:declined`. The current `client/src/hooks/useSocket.js` hook does not subscribe to that channel, so decline events are reflected through forced data refreshes and history reads rather than a dedicated client-side Socket.IO listener.

## Testing

Run the contract suite from the repository root:

```bash
npm test
```

Equivalent direct command:

```bash
cd blockchain
npm test
```

Current verified output:

```text
NFTMarketplace
NFTMinter
112 passing (4s)
```

The suite covers:

- minting, burning, royalty assignment, pause/unpause, owner controls, and ERC-721 transfers in `NFTMinter`
- fixed-price listings, auctions, bids, settlement, offers, pause rules, and payment paths in `NFTMarketplace`

## Security Model

### Trust-Minimized On-Chain

- NFT ownership, transfer rights, and burn rights are enforced by `NFTMinter`.
- Fixed-price listings and auctions escrow NFTs inside `NFTMarketplace`.
- Offers and bids escrow ETH in the marketplace contract until acceptance, cancellation, expiry handling, or settlement.
- ERC-2981 royalty calculations are resolved from the NFT contract during sales, auction settlement, and offer acceptance.
- Reentrancy protection is applied to external-call payment paths in `NFTMarketplace`.
- Emergency pause controls exist on both contracts. Asset recovery paths such as `settleAuction` and `cancelListing` remain callable while paused.

### Trusted Server Responsibilities

- Pinata API calls for media and metadata pinning
- IPFS gateway proxying and local cache persistence
- REST aggregation of contract reads and historical events
- Socket.IO event broadcast
- CU-budget-aware event polling, stale response fallback, and cache invalidation

### Data That Never Touches the Browser

- `PRIVATE_KEY`
- `SEPOLIA_RPC_URL` / `RPC_URL` provider credentials
- `PINATA_API_KEY`
- `PINATA_SECRET_KEY`
- `PINATA_GATEWAY_KEY`
- `ETHERSCAN_API_KEY`

The browser only holds public contract addresses, token metadata, REST responses, and wallet session state. Every state-changing transaction is signed in MetaMask.

## Standards and Reference Implementations

- ERC-721 non-fungible token standard
- ERC-2981 royalty standard
- ERC-165 interface detection
- OpenZeppelin Contracts v5.6.1
- Hardhat 2.28.6 deployment and test framework
- Ethers.js v6.16.0 for client and server contract interaction

## Known Limitations

- Metadata pinning depends on Pinata. The application does not currently pin the same content to multiple IPFS providers or Arweave.
- `NFTMarketplace.getActiveListings()` scans all listing IDs. This is acceptable at current scale and degrades as the listing set grows.
- The server event store uses linear deduplication and caps persisted events at 5,000 entries.
- The read side has no database. Availability depends on cached files, chain backfill, and external RPC access.
- Browser end-to-end coverage is not present. The automated suite is contract-only.
- `offer:declined` is emitted by the server but is not subscribed to by the current client socket hook.

## Roadmap

- Replace O(n) active-listing scans with an indexed active set
- Replace linear event deduplication with indexed persistence
- Add redundant content pinning and long-term storage
- Add browser end-to-end tests and CI reporting
- Publish deployment manifests instead of hardcoding client addresses
- Add explicit coverage reporting rather than using test count as the current public signal

## License

No root `LICENSE` file is present in this repository. Until a license file is added, redistribution and reuse are not granted by default.
