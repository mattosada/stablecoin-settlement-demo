# Stablecoin Settlement Demo

A USDC checkout on Ethereum Sepolia testnet. Customer pays merchant, settlement in seconds, confirmation on-chain.

Built by a payments PM (cards, acquiring, gateway) to bridge the gap between card rails and stablecoin rails. Testnet only — zero real money.

## What it does

A customer pays a merchant in USDC on Sepolia. The payment is confirmed on-chain in ~15 seconds. Both wallets show balances, transaction history, gas fees paid, and links to the block explorer. A comparison page maps card rail concepts (auth/capture, interchange, chargeback, T+2 settlement) to their stablecoin equivalents.

## The flow

```
Browser (checkout.html)
  → POST /api/pay { amount }
    → lib/circle.js: idempotency check (payments.json)
      → Circle SDK: createTransaction
        → Ethereum Sepolia: block confirmed (~15s)
    → response: { state, hash, networkFee, explorerUrl }
  → UI: confirmation + gas fee + block explorer link
```

## Stack

- **Backend:** Node.js, Express, Circle Developer-Controlled Wallets SDK
- **Frontend:** HTML, CSS, vanilla JS. No framework.
- **Blockchain:** Ethereum Sepolia testnet
- **Custody:** Shared (MPC) via Circle Programmable Wallets

## Pages

| Route | What it shows |
|---|---|
| `/checkout` | Payment form, confirmation, gas fee, explorer link |
| `/customer` | USDC + ETH balances, transaction history with fees paid |
| `/merchant` | USDC + ETH balances, transaction history (no fees — sender pays) |
| `/compare` | Card rails vs stablecoin: 13 dimensions side by side |

## Setup

### Prerequisites

- Node.js
- A [Circle developer account](https://console.circle.com) (testnet)

### 1. Clone and install

```bash
git clone <repo-url>
cd stablecoin-settlement-demo
npm install
```

### 2. Configure secrets

```bash
cp .env.example .env
```

Fill in your Circle testnet API key and entity secret. Save your recovery `.dat` file — if you lose it, the account is unrecoverable.

### 3. Generate wallets

```bash
npm run setup                       # generates RSA key pair + entity secret
node scripts/create-wallets.js      # creates customer + merchant wallets on Sepolia
```

Add the wallet IDs to `.env`.

### 4. Fund wallets

Use the faucet in Circle Console → Programmable Wallets → Faucet. Each wallet needs USDC (for payments) and ETH (for gas). 

### 5. Run

```bash
npm start
```

Open `http://localhost:3000/checkout`.

## Project structure

```
lib/circle.js              Circle SDK wrapper with idempotent transactions
server.js                  Express server: API + static files
public/
  checkout.html            Payment page
  wallet.html              Customer/merchant wallet view (shared)
  compare.html             Card vs stablecoin comparison table
  style.css                Shared styles
scripts/                   One-shot setup scripts (not part of the running app)
payments.json              Idempotency ledger (gitignored)
```

## Key design decisions

**Idempotency.** Every payment gets a unique key, persisted before the API call. If the server crashes after Circle accepts the transaction, a retry reuses the existing transaction instead of creating a duplicate. Learned this the hard way — a crash during the build caused three identical transfers instead of one.

**Developer-controlled wallets.** The customer never manages keys or signs transactions. Same UX as card checkout: enter amount, click pay. Circle holds half the signing key, the server holds the other half (entity secret).

**Fees displayed per payer.** Customer view shows gas fees on outbound transactions only. Merchant view shows no fees — the sender always pays gas. Each wallet sees only the costs it actually bears.

## Lessons from the build

1. Inspect API responses before writing code that depends on them.
2. Build idempotency before the first transaction, not after the first duplicate.
3. Every API call in a payment flow can cost money. A crash after the call does not undo the call.
4. Save provider recovery files immediately. There is no "forgot my password" in shared custody.
5. Know your rate limits before consuming test resources.

Detailed write-up: [link to article]
