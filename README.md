# 🪙 Rendimientos — Sovereign Bitcoin Savings Platform

A modern, high-performance web application (SPA) enabling individuals and enterprises to save in Bitcoin (**BTC**) with full financial sovereignty, automated fiat-to-crypto conversion, real-time live price streaming, and portfolio yield management.

---

## 🌟 Overview

**Rendimientos** bridges traditional banking with Bitcoin's monetary network. It allows users to automatically stack satoshis, execute sub-second Lightning Network payments, receive and send native On-Chain Bitcoin transactions, and monitor live portfolio yields calculated against fiat fluctuations.

### Key Capabilities & Highlights
- **Automated Fiat-to-Bitcoin Purchasing**: Integrates real-time banking webhooks (e.g., Bancolombia deposit webhooks) that automatically convert incoming fiat deposits (>= 10 USDT equivalent) into Bitcoin (BTC) via automated market buy orders.
- **Dual-Layer Bitcoin Support**: Operates natively on both **Bitcoin Layer 1 (On-Chain Bech32 Native Segwit)** and **Bitcoin Layer 2 (Lightning Network)**.
- **High-Frequency Market Streaming**: Connects directly to Binance WebSockets for zero-latency live `BTC/USDT` and `USDT/COP` price feeds.
- **Atomic Balance & Yield Accounting**: Serverless backend Cloud Functions powered by atomic database transactions ensure sub-millisecond ledger consistency for user balances, weighted average purchase prices (`avgBuyPrice` in COP and `avgBuyPriceUsdt` in USD), and real-time yield percentage calculation.
- **Enterprise Admin Console**: Admin dashboard providing real-time liquidity monitoring across Lightning channels and On-Chain reserves, user profile management, fee metrics, and full transaction audit receipts.

---

## ⚡ Bitcoin Configuration & Infrastructure

Rendimientos is engineered around a secure, multi-layer Bitcoin infrastructure designed for high availability, self-sovereignty, and zero-trust operation.

```
       +-------------------------------------------------------------+
       |                  Next.js 15 Web Application                 |
       +-------------------------------+-----------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
        +----------v----------+                 +----------v----------+
        |   Bitcoin Lightning |                 |   Bitcoin On-Chain  |
        |   (Layer 2 - LND)   |                 |  (Layer 1 - Bech32) |
        +----------+----------+                 +----------+----------+
                   |                                       |
                   | REST / Macaroon Auth                  | Mempool.space Fee API
                   v                                       v
        +---------------------+                 +---------------------+
        |  `lndProxy` Function|                 | `syncOnChainDeposits|
        | (Zero-Trust VM Proxy|                 | (1-Block Conf Engine|
        +---------------------+                 +---------------------+
```

### 1. ⚡ Lightning Network (Layer 2)
* **Node Infrastructure**: Powered by **LND (Lightning Network Daemon)**.
* **Zero-Trust Reverse Proxy**: API traffic is securely routed through a dedicated Compute Engine proxy VM (`lnd-proxy-vm2`) using `MAIN_LND_MACAROON` secret headers with strict endpoint whitelisting (`/v1/invoices`, `/v1/channels/transactions`, `/v1/fees`) to prevent unauthorized node interaction.
* **Instant Lightning Deposits**: On-demand invoice generation (`bolt11`) for instant settlement with zero network fees.
* **Lightning Withdrawals**: QR scanning (`html5-qrcode`) & invoice parsing (`bolt11`), automated route finding, client-side balance validation, and instant settlement execution via `/v1/channels/transactions`.

### 2. 🔗 Bitcoin On-Chain Network (Layer 1)
* **Native SegWit Address Management**: Generates dedicated Bech32 (`WITNESS_PUBKEY_HASH`) deposit addresses per user on demand via LND (`/v1/newaddress`), indexed securely in RTDB under `/btcAddresses/{address}`.
* **1-Block Confirmation Settlement Engine**: Scheduled background process (`syncOnChainDeposits`) periodically checks for incoming on-chain transactions, verifying destination ownership and atomically crediting user balances after **1 confirmation** (~10 minutes).
* **Mempool.space Fee Estimator**: Live integration with Mempool.space precise fee API offering 3 configurable priority tiers (**High**, **Medium**, **Low** sat/vB) with accurate 148 vBytes fee estimation. Address validity is strictly verified via `bitcoin-address-validation`.

### 3. 📈 Automated Execution & Price Feeds
* **Bank Webhook Market Purchases**: Bancolombia email webhook parses depositor details, verifies account matching, and executes market buy orders for deposits meeting minimum liquidity thresholds (>= 10 USDT).
* **Multi-Tier Price Feed Failover**: Primary live pricing provided by Binance WebSockets (`btcusdt@ticker`, `usdtcop@ticker`), backed by failover price fetching from CoinGecko API and Coinbase API to ensure continuous price discovery.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| **Frontend Framework** | Next.js 15.3.1 (App & Pages router), React 19, TypeScript |
| **Styling & UI System** | Custom Vanilla CSS Wallet Design System + TailwindCSS 3.4 |
| **Backend & Serverless** | Node.js 22 (Cloud Functions 2nd Gen), Firebase Realtime Database (RTDB), Firebase Auth |
| **Bitcoin & Cryptography** | `bolt11`, `bitcoin-address-validation`, `ethers`, `@metamask/sdk`, `html5-qrcode`, `qrcode.react` |
| **Infrastructure & Networking** | LND Node, Tailscale Mesh Network, Nginx Proxy Manager, GCP Compute Engine (`e2-small`) |

---

## 📁 Repository Structure (`my-spa/`)

```
my-spa/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Primary Digital Wallet SPA (Balances, Yield, Deposits & Withdrawals)
│   │   ├── admin/page.tsx    # Admin Console (Node Liquidity, User Directory, Manual Ops)
│   │   ├── layout.tsx        # App Root Layout & Metadata
│   │   ├── components/       # Reusable Components (QrScanner, etc.)
│   │   └── lib/              # Firebase & Web3 Initialization
│   ├── pages/                # Document and auxiliary page routes
│   └── shims/                # Browser polyfills
├── public/                   # Static assets & icons
├── next.config.js            # Environment configs & security rewrites
├── tailwind.config.ts        # Tailwind configuration
└── package.json              # App manifest & dependencies
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20 or v22
- **Package Manager**: `pnpm`
- **Firebase CLI**: `npm install -g firebase-tools`

### Environment Configuration
Create a `.env.local` file in `my-spa/`:
```env
NEXT_PUBLIC_POLYGON_RPC_URL=https://polygon-mainnet.infura.io/v3/YOUR_INFURA_KEY
NEXT_PUBLIC_USDT_CONTRACT_ADDRESS=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
NEXT_PUBLIC_APP_WALLET_ADDRESS=0x...
NEXT_PUBLIC_INFURA_KEY=YOUR_INFURA_KEY
NEXT_PUBLIC_BASE_FEE_RATE=0.005
```

### Installation & Local Development
```bash
# Install dependencies
pnpm install

# Start local dev server with Turbopack
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build & Deploy
```bash
# Build Next.js SPA & sync output to functions/.next/
pnpm run build

# Deploy full application stack via Firebase CLI
pnpm run deploy
```

---

## 🔐 Security & Compliance

- **Zero-Trust LND Proxy**: Restricted RPC endpoint whitelisting prevents unauthorized node operations.
- **Atomic Balance Mutex**: All balance modifications are strictly governed by backend database transactions in Cloud Functions (`onDepositSettled`, `notifyWithdrawalSettled`).
- **Secret Manager**: Sensitive macaroons, SMTP credentials, and API secrets are stored securely in Google Cloud Secret Manager.

---

## 📄 License & Contact

Private & Confidential — **Rendimientos Platform**.  
For enterprise integration or platform inquiries, please reach out to the development team.

