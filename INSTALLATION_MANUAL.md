# User Manual

## Project Identification

| Field | Value |
| --- | --- |
| Module | `CN6035 - Full-Stack Blockchain Development` |
| Student ID | `U2643145` |
| Project | `Hybrid DApp Development: NFT Minting & Marketplace Platform` |
| Network | `Ethereum Sepolia Testnet (Chain ID 11155111)` |
| NFT Contract | `0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738` |
| Marketplace Contract | `0x45F9EC0878f1236E4705C23099CaF6315C61D2dA` |
| Demo video | `https://youtu.be/5eIeuYzYGqQ` |

This manual describes how to use the NFT Minting & Marketplace Platform deployed on Ethereum Sepolia. It is written for end users, evaluators, and developers who need to verify application behaviour against the current codebase. All value transfers in this application use Sepolia test ETH. Do not send mainnet assets to these contracts.

## 1. Purpose

The application lets users mint ERC-721 NFTs, browse collection metadata, list tokens for fixed-price sale, create English auctions, place bids, make escrowed offers, inspect historical activity, and perform owner-only contract administration. On-chain state is enforced by the deployed smart contracts. The web application provides the user interface, IPFS upload flow, read-side aggregation, and real-time updates.

## 2. System Requirements

| Requirement | Details |
| --- | --- |
| Browser | Desktop browser with MetaMask extension support. The project is built for a modern desktop browser. |
| Wallet | MetaMask extension exposing an EIP-1193 provider (`window.ethereum`) |
| Network | Ethereum Sepolia, chain ID `11155111`, native currency `ETH` |
| Funds | Sepolia ETH for minting, listing approvals, bids, and offers |
| Local access | Client at `http://localhost:3000` and server at `http://localhost:5000` for local evaluation |

## 3. Application Map

| Page | Route | Purpose |
| --- | --- | --- |
| Home | `/` | wallet connection, collection stats, quick navigation |
| Mint | `/mint` | upload media, define metadata, mint NFT |
| Gallery | `/gallery` | browse all NFTs, search, filter, favorite |
| Marketplace | `/marketplace` | view and act on active listings and auctions |
| My NFTs | `/my-nfts` | view owned NFTs, favorites, and owned-token actions |
| NFT Detail | `/nft/:tokenId` | inspect one token and perform role-specific actions |
| Profile | `/profile/:address` | view another address, owned NFTs, active listings, and created count |
| Admin | `/admin` | owner-only contract and marketplace administration |
| History | `/history` | filter and inspect collection activity |

Read-only browsing is possible without a wallet. Any action that changes blockchain state requires MetaMask.

## 4. Getting Started

### 4.1 Download Dependencies and Start the App

If you are running the repository locally, install dependencies before opening the application.

Recommended from the repository root:

```bash
npm install
npm run install:all
```

Direct per-service workflow:

1. Install blockchain dependencies.

   ```bash
   cd blockchain
   npm install
   npm run compile
   ```

2. Start the API server in a separate terminal.

   Development mode:

   ```bash
   cd server
   npm install
   npm run dev
   ```

   Standard start command:

   ```bash
   cd server
   npm start
   ```

3. Start the client in another terminal.

   ```bash
   cd client
   npm install
   npm run dev
   ```

4. Open the application in the browser.

   - Client: `http://localhost:3000`
   - Server API: `http://localhost:5000`

5. Ensure the environment files are present before starting:

   - `blockchain/.env`
   - `server/.env`
   - optional `client/.env`

Installed workspace dependencies used by this application:

| Workspace | Packages |
| --- | --- |
| Root | `eslint`, `eslint-plugin-react`, `prettier`, `solhint` |
| Blockchain | `hardhat`, `@nomicfoundation/hardhat-toolbox`, `@nomicfoundation/hardhat-verify`, `@openzeppelin/contracts`, `dotenv` |
| Server | `express`, `cors`, `dotenv`, `ethers`, `helmet`, `morgan`, `express-rate-limit`, `multer`, `axios`, `form-data`, `socket.io`, `nodemon` |
| Client | `react`, `react-dom`, `react-router-dom`, `react-hot-toast`, `recharts`, `ethers`, `socket.io-client`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `@types/react`, `@types/react-dom` |

### 4.2 Install and Prepare MetaMask

1. Install the MetaMask browser extension.
2. Create a new wallet or import an existing test wallet.
3. Unlock MetaMask before opening the application.

### 4.3 Select Sepolia

MetaMask usually includes Sepolia by default. If the application detects another network, it requests a switch to Sepolia automatically.

If you need to add the network manually, use:

| Field | Value |
| --- | --- |
| Network name | `Sepolia` |
| Chain ID | `11155111` |
| Currency symbol | `ETH` |
| Block explorer | `https://sepolia.etherscan.io` |

### 4.4 Obtain Sepolia ETH

1. Copy your wallet address from MetaMask.
2. Use a Sepolia faucet.
3. Wait for the faucet transfer to confirm on Sepolia.
4. Verify the balance in MetaMask before attempting mint, list, bid, or offer flows.

### 4.5 Open the Application

1. Start the server and client locally if you are running the repository yourself.
2. Open `http://localhost:3000`.
3. Confirm that the home page loads collection statistics from the API.

## 5. Wallet Workflows

### 5.1 Connect Wallet

1. Click the wallet connection button on the home page or in the navigation bar.
2. Approve the connection request in MetaMask.
3. If MetaMask prompts for a network change, approve the switch to Sepolia.
4. Wait for the account address to appear in the application.

Result:

- the client stores a local `walletConnected` flag
- the wallet reconnects automatically after a page reload if MetaMask is still available
- account and chain changes are tracked without a full page refresh

### 5.2 Disconnect Wallet

1. Use the disconnect action from the wallet controls in the UI.
2. The application clears its local session state and removes the cached reconnect flag.

Important:

- this does not submit an on-chain transaction
- this does not revoke MetaMask site permissions globally
- MetaMask remains installed and unlocked unless you change it yourself

## 6. Minting an NFT

The mint flow is a three-step wizard: upload, details, and mint.

### 6.1 Upload the Media File

1. Open `/mint`.
2. Choose an image file in one of the supported formats: `PNG`, `JPEG`, `GIF`, `WebP`, or `SVG`.
3. Ensure the file is `10 MB` or smaller.
4. Submit the upload.

What happens next:

- the client sends the file to `POST /api/upload/image`
- the server pins the file to Pinata
- the server caches the asset locally for subsequent IPFS resolution

### 6.2 Enter Metadata

1. Enter a token name. This field is required.
2. Enter a description if needed.
3. Add trait attributes if you want the item to be filterable in the gallery.
4. Select a royalty percentage between `0%` and `50%`.

Royalty behaviour:

- a royalty above `0%` creates a per-token ERC-2981 royalty for the minter
- a royalty of `0%` uses the contract default royalty configuration

### 6.3 Mint On-Chain

1. Continue to the review step.
2. Confirm that the preview, metadata, and royalty are correct.
3. Click the mint action.
4. Approve the MetaMask transaction.
5. Wait for transaction confirmation.

What happens next:

- the client calls `POST /api/upload/metadata`
- the server pins the metadata JSON and returns a token URI
- the client sends `mintNFT(tokenURI, royaltyBps)` with the contract mint price as `msg.value`
- the NFT is minted to the connected account

Expected result:

- success toast with an Etherscan transaction link
- the new token appears in `/my-nfts`, `/gallery`, and `/nft/:tokenId`
- a `nft:minted` real-time event is emitted by the server poller

## 7. Browsing the Gallery

1. Open `/gallery`.
2. Use the search box to search by token name, token ID, description, or address.
3. Use sort controls to order by newest, oldest, token ID, or name.
4. Use the filter mode to show all NFTs, your NFTs, or favorites.
5. Use trait filters to narrow the collection by metadata attributes.
6. Switch between grid and list layouts if needed.
7. Use pagination controls to move through the collection.

Notes:

- active marketplace prices are merged into gallery cards from `/api/marketplace/listings/active`
- favorites are stored locally per connected wallet address

## 8. Viewing Token Detail Pages

1. Open an NFT card from the gallery, marketplace, my NFTs page, or history links.
2. Review the token metadata, owner, creator, royalty information, active listing state, offer list, price history, and transaction activity.
3. Use the Etherscan links to inspect the token contract and related transactions externally.
4. Use the metadata refresh action if the media or metadata appears stale.

Role-based actions available on the detail page:

| Your relationship to the token | Available actions |
| --- | --- |
| Owner, unlisted | create fixed-price listing, create auction, transfer, burn, accept offers, decline offers |
| Owner, fixed-price listed | update price, cancel listing |
| Owner, auction listed | cancel auction only if there are no bids; settle after the auction ends |
| Non-owner, fixed-price listed | buy now |
| Non-owner, auction listed | place bid; settle after end if applicable |
| Non-owner, unlisted or listed | make offer |
| Offer maker | cancel own offer |

## 9. Creating a Fixed-Price Listing

1. Open the token detail page or `/my-nfts`.
2. Choose the listing action.
3. Select the fixed-price mode.
4. Enter a non-zero price in ETH.
5. Confirm the marketplace approval transaction in MetaMask.
6. Confirm the listing transaction in MetaMask.

What the contract does:

- transfers the NFT into marketplace escrow
- records the seller, token ID, and price
- exposes the listing through `/api/marketplace/listings` and `/api/marketplace/listings/active`

Operational notes:

- the seller cannot buy their own listing
- the listing can be cancelled by the seller while it remains active
- a fixed-price listing can be repriced from the detail page

## 10. Creating an English Auction

1. Open the token detail page or `/my-nfts`.
2. Choose the listing action.
3. Select the auction mode.
4. Enter a non-zero starting price.
5. Enter a reserve price if you want to enforce a minimum settlement value. A reserve of `0` disables that threshold.
6. Select a duration. The UI exposes durations from `1 hour` up to `30 days`.
7. Confirm the marketplace approval transaction.
8. Confirm the auction creation transaction.

What the contract does:

- escrows the NFT in the marketplace
- records starting price, reserve price, and end time
- rejects invalid durations outside the allowed range

Settlement rules:

- bids below the required threshold are rejected
- if the reserve is not met at settlement time, the NFT returns to the seller and the highest bidder is refunded

## 11. Placing a Bid

1. Open an active auction in `/marketplace` or on the token detail page.
2. Check the current highest bid and auction end time.
3. Enter a bid amount.
4. Ensure the amount is:
   - at least the starting price if no bids exist
   - strictly greater than the current highest bid if a bid already exists
5. Confirm the MetaMask transaction with the bid value attached.

Expected result:

- the marketplace records you as the highest bidder if your bid is valid
- the previous highest bidder is refunded automatically if you outbid them
- the UI updates through `marketplace:bid` and subsequent REST refreshes

## 12. Offers

Offers are independent of listings. An offer can be made on a token whether or not it currently has an active listing.

### 12.1 Make an Offer

1. Open a token detail page.
2. Select the offer action.
3. Enter the offer amount in ETH.
4. Select the offer duration. The UI exposes hour-based durations.
5. Confirm the MetaMask transaction.

What the contract does:

- escrows the offered ETH in the marketplace
- records `buyer`, `tokenId`, `amount`, and `expiresAt`

### 12.2 Accept an Offer

1. Open a token you own.
2. Locate the active offer in the offers table.
3. Choose accept.
4. Confirm the marketplace approval transaction if prompted.
5. Confirm the offer acceptance transaction.

Expected result:

- the NFT transfers to the buyer
- sale proceeds are split between seller and royalty receiver according to ERC-2981
- the offer becomes inactive

### 12.3 Decline an Offer

1. Open a token you own.
2. Locate the active offer.
3. Choose decline.
4. Confirm the MetaMask transaction.

Expected result:

- the offer becomes inactive
- the buyer receives a refund from contract escrow

### 12.4 Cancel Your Own Offer

1. Open the token detail page or your own profile page.
2. Locate the offer you created.
3. Choose cancel.
4. Confirm the MetaMask transaction.

Expected result:

- the offer becomes inactive
- your escrowed ETH returns to your wallet

## 13. Buying a Fixed-Price Listing

1. Open a fixed-price listing in `/marketplace` or on a token detail page.
2. Review the list price and token metadata.
3. Click the buy action.
4. Confirm the MetaMask transaction with the listed ETH value.

Expected result:

- the NFT transfers from marketplace escrow to your wallet
- sale proceeds are distributed according to the marketplace payment logic
- overpayment, if any, is refunded by the contract

## 14. Viewing Transaction History

1. Open `/history`.
2. Use filters to narrow by event type, address, or token ID.
3. Use search to find a transaction hash, address fragment, listing ID, or offer ID.
4. Open the Etherscan links on any row for external verification.

History includes the collection-level events surfaced by the application, including:

- mint
- transfer
- burn
- approval and approval-for-all activity when available
- listing creation and cancellation
- price updates
- sales
- bids
- auction settlement
- offer creation, acceptance, cancellation, and decline

## 15. My NFTs, Favorites, Transfers, Burns, and Profiles

### 15.1 My NFTs

Use `/my-nfts` to:

- view NFTs currently owned by the connected wallet
- open owned-token actions quickly
- see owned-token offers
- switch to the favorites tab

### 15.2 Favorites

Favorites are client-side only.

1. Mark a token as favorite in the gallery or detail UI.
2. Retrieve favorites from `/my-nfts`.
3. Favorites are stored per account in local storage.

### 15.3 Transfer an NFT

1. Open a token you own.
2. Choose transfer.
3. Enter a valid Ethereum recipient address.
4. Confirm the MetaMask transaction.

Important:

- transfers are irreversible
- the recipient does not need to interact with the application to receive the token

### 15.4 Burn an NFT

1. Open a token you own.
2. Choose burn.
3. Read the warning.
4. Type `BURN` to unlock the confirmation action.
5. Confirm the transaction in MetaMask.

Expected result:

- the token is permanently destroyed
- it no longer appears as an active NFT
- burned count and supply statistics update after cache invalidation and refetch

### 15.5 Profile Pages

Open `/profile/:address` to inspect a wallet address. The profile page shows:

- owned NFTs for that address
- active listings by that address
- created-count derived from mint history
- offers made, when viewing your own profile

## 16. Admin Dashboard

The admin page is at `/admin`. It is owner-only. Access is granted when the connected wallet matches `NFTMinter.owner()`.

### 16.1 Available Operations

| Operation | Effect |
| --- | --- |
| Pause or unpause NFT contract | blocks or restores mint and burn operations |
| Pause or unpause marketplace | blocks or restores new listings, purchases, bids, and offers |
| Update mint price | changes the ETH value required for future mints |
| Update max supply | raises or adjusts max supply, but not below the current minted count |
| Withdraw contract balance | transfers accumulated mint proceeds from the NFT contract to the owner |

### 16.2 Operational Notes

- all admin actions are on-chain transactions
- if marketplace ownership and NFT contract ownership differ, marketplace admin calls can fail even if the NFT owner page opens
- pause controls do not permanently lock user assets; settlement and asset-recovery paths remain available in the marketplace contract

## 17. Understanding Transaction States

| State | Meaning | What to Do |
| --- | --- | --- |
| Pending | MetaMask submitted the transaction and it is waiting to be mined | wait, monitor Etherscan, or use MetaMask speed-up/cancel tools if it remains pending |
| Confirmed | the transaction is mined successfully and state changed on-chain | refresh the affected page if the UI has not updated yet |
| Failed | the transaction reverted, was rejected, or was cancelled | read the error message, correct the precondition, and resubmit only if appropriate |

Practical guidance:

- do not submit the same buy, bid, or accept action twice while the first transaction is still pending
- state may change on-chain before the server poller and cache layer refresh the UI

## 18. Error Messages and What They Mean

### 18.1 Wallet, UI, and API Errors

| Message | Meaning | Action |
| --- | --- | --- |
| `MetaMask not detected. Please install MetaMask browser extension.` | no EIP-1193 wallet provider is available | install MetaMask and reload |
| `Please switch to Sepolia network in MetaMask.` | the connected wallet is on the wrong chain | switch to Sepolia and retry |
| `Connection rejected. Please approve the connection in MetaMask.` | the wallet connection request was denied | reconnect and approve |
| `Failed to connect wallet` | generic wallet connection failure | unlock MetaMask, verify browser support, retry |
| `Invalid file type` | uploaded media type is not one of the supported image formats | upload `PNG`, `JPEG`, `GIF`, `WebP`, or `SVG` |
| `File too large` | uploaded media exceeds `10 MB` | compress or replace the image |
| `Failed to upload image` | image upload to Pinata or the server failed | verify server configuration and retry |
| `Failed to upload metadata` | metadata pinning failed | retry after the image upload succeeds |
| `Invalid Ethereum address` | recipient, owner, or buyer address format is invalid | correct the address |
| `Token not found or has been burned` | the token ID does not exist or was burned | verify the token ID and current ownership |
| `Too many requests` or `RATE_LIMITED` | API rate limiter blocked the request | wait and retry after the limit window resets |

### 18.2 `NFTMinter` Reverts

| Contract Message | Meaning | Typical Action |
| --- | --- | --- |
| `Insufficient ETH sent for minting` | `msg.value` is below the current mint price | send at least the displayed mint price |
| `Maximum supply reached` | no more tokens can be minted under the current max supply | stop minting or ask the owner to raise max supply |
| `Royalty cannot exceed 50%` | royalty basis points are above `5000` | reduce royalty input |
| `Only the owner can burn this NFT` | the connected account does not own the token | switch to the owner account |
| `No funds to withdraw` | the NFT contract balance is zero | wait until mint proceeds exist |
| `Withdrawal failed` | ETH transfer from the NFT contract failed | inspect the owner address and transaction result |
| `New max supply below minted count` | admin attempted to set supply below the number already minted | choose a higher max supply |

### 18.3 `NFTMarketplace` Custom Errors

| Error | Meaning | Typical Trigger | Action |
| --- | --- | --- | --- |
| `NotTokenOwner` | caller does not own the token | creating a listing or auction from the wrong wallet | switch to the token owner |
| `PriceCannotBeZero` | required ETH value is zero | listing price or auction start price is `0` | enter a non-zero value |
| `ListingNotActive` | listing is inactive | buying, updating, or cancelling an already closed listing | refresh the page and re-evaluate |
| `CannotBuyOwnListing` | seller attempted to buy or bid on own listing | self-purchase or self-bid | use a different account |
| `InsufficientPayment` | sent ETH is below the sale price | buy-now call with too little ETH | send the full listed amount |
| `NotAuction` | action is valid only for auctions | bidding or settling a fixed-price listing | use the correct listing type |
| `AuctionEnded` | auction already ended | bid submitted after the end time | settle the auction or choose another listing |
| `AuctionNotEnded` | auction is still active | settle attempted too early | wait until the end time passes |
| `BidTooLow` | bid does not satisfy the minimum requirement | first bid below start price or later bid not above current highest | raise the bid |
| `NotSeller` | caller is not the listing seller | cancel or reprice from another wallet | switch to the seller account |
| `AuctionHasBids` | auction cannot be cancelled after bidding has started | seller tries to cancel after receiving a bid | wait for settlement |
| `InvalidDuration` | duration is outside the allowed range | auction shorter than `1 hour` or longer than `30 days` | choose a valid duration |
| `ReserveNotMet` | settlement value is below reserve | auction ended below reserve | settle to return NFT and refund bidder |
| `InvalidListingType` | action does not match listing mode | buying an auction or repricing an auction | use bid or settlement flow instead |
| `OfferTooLow` | offer amount is zero | make-offer call with `0 ETH` | enter a positive offer amount |
| `OfferNotActive` | offer is inactive | accept, cancel, or decline after closure | refresh offer state |
| `NotOfferMaker` | caller did not create the offer | cancelling someone else's offer | switch to the offer maker |
| `NotNFTOwner` | caller does not own the NFT | accepting or declining an offer from a non-owner wallet | switch to the current owner |
| `OfferExpired` | offer expiry time has passed | accepting an offer after expiration | create a new offer |
| `InvalidExpiration` | expiration is not in the future | make-offer call with a past or immediate expiration | set a future expiration |

Additional framework-level errors can also surface from OpenZeppelin v5, including `OwnableUnauthorizedAccount`, `EnforcedPause`, and `ERC721InsufficientApproval`. These indicate missing owner privileges, a paused contract, or missing marketplace approval.

## 19. Etherscan Verification Guide

### 19.1 Verify a Transaction

1. Copy the transaction hash from the success toast, MetaMask activity, or history page.
2. Open `https://sepolia.etherscan.io/tx/<tx-hash>`.
3. Confirm:
   - `Status` is `Success`
   - `From` and `To` are correct
   - event logs match the action you performed

### 19.2 Verify the Deployed Contracts

Open the contract pages directly:

- `NFTMinter`: `https://sepolia.etherscan.io/address/0x026793AE8e6fcEb59d5BFaEa80C56BffbE349738#code`
- `NFTMarketplace`: `https://sepolia.etherscan.io/address/0x45F9EC0878f1236E4705C23099CaF6315C61D2dA#code`

What to check:

- the contract page opens on Sepolia, not mainnet
- the `Contract` tab shows verified source code
- the ABI is visible on the verified contract page

### 19.3 Verify a Redeployment as a Developer

Both contracts deploy with empty constructor argument arrays.

```bash
cd blockchain
npx hardhat verify --network sepolia <NFTMINTER_ADDRESS>
npx hardhat verify --network sepolia <MARKETPLACE_ADDRESS>
```

## 20. Troubleshooting

| Symptom | Likely Cause | Resolution |
| --- | --- | --- |
| MetaMask button does nothing or wallet is not detected | extension missing, disabled, or locked | install or unlock MetaMask, then reload the page |
| Application says the wallet is on the wrong network | MetaMask is not on Sepolia | switch to Sepolia manually or approve the app's network switch request |
| Transaction remains pending for a long time | Sepolia congestion or low fee settings | inspect the hash on Etherscan, then use MetaMask `Speed Up` or `Cancel` if needed |
| Buy, bid, or accept fails after the page was open for a while | on-chain state changed before your transaction was mined | refresh the listing or token page and retry only if the state is still valid |
| Accepting an offer fails | marketplace approval is missing or token ownership changed | approve the marketplace again and verify you still own the token |
| Auction settlement fails | auction end time not reached or listing state already changed | wait for the end time or refresh and inspect current state |
| Uploads fail with a server-side error | Pinata credentials are missing or invalid | verify `PINATA_API_KEY` and `PINATA_SECRET_KEY` in `server/.env` |
| Images or metadata load slowly | IPFS gateway latency or public fallback gateway | wait, then use the metadata refresh action on the token detail page |
| History page times out or shows partial data | RPC latency or temporary transfer API fallback | retry from the page and allow extra time for backfill |
| Burned or sold token still appears briefly | server cache or poller has not refreshed yet | wait for the next refresh cycle or reopen the page |
| Local client cannot reach the API | server is not running or Vite proxy target is wrong | confirm the API is on `http://localhost:5000` and the client is on `http://localhost:3000` |

## 21. Glossary

| Term | Meaning |
| --- | --- |
| NFT | Non-fungible token; a unique blockchain asset |
| ERC-721 | Ethereum token standard for non-fungible tokens |
| ERC-2981 | Ethereum royalty standard used to calculate creator royalties |
| ERC-165 | Interface detection standard used by contracts to declare supported interfaces |
| Token URI | Metadata pointer for an NFT, typically resolving to IPFS-hosted JSON |
| IPFS | InterPlanetary File System; content-addressed storage used for media and metadata |
| CID | Content identifier used by IPFS to address a specific object |
| Sepolia | Ethereum public test network used by this application |
| Gas | Fee paid to execute a transaction on Ethereum |
| Escrow | Contract-held asset custody until conditions are met |
| Royalty | Portion of sale proceeds paid to a designated receiver |
| Fixed-price listing | Sale mode where a buyer can purchase immediately at the listed price |
| English auction | Sale mode where bids compete until the end time |
| Reserve price | Minimum acceptable final auction amount |
| Offer | Buyer-submitted escrowed proposal to purchase a token |
| Settlement | Finalization of an auction after it ends |
| Etherscan | Blockchain explorer used to inspect Sepolia addresses and transactions |
| MetaMask | Browser wallet used to sign and submit transactions |

## 22. Final Notes

- Always verify that MetaMask shows Sepolia before signing.
- Always verify the transaction hash on Etherscan when an action matters.
- Always treat IPFS media availability and cached API data as eventually consistent rather than instantaneous.
