# Stablecoin Settlement Demo

A USDC checkout on Ethereum Sepolia testnet. Customer pays merchant, settlement in seconds, confirmation on-chain.

Built by a payments PM (cards, acquiring, gateway) to bridge the gap between card rails and stablecoin rails. Testnet only — zero real money.

## What it does

A customer pays a merchant in USDC on Sepolia. The payment is confirmed on-chain in ~15 seconds. Both wallets show balances, transaction history, gas fees paid, and links to the block explorer. A comparison page maps card rail concepts (auth/capture, interchange, chargeback, T+2 settlement) to their stablecoin equivalents.

An on-ramp page lets the customer buy crypto by card through MoonPay (sandbox), delivered on-chain to the same Circle wallet. An off-ramp page opens MoonPay's sell widget.

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

On-ramp:

```
Browser (buy.html + moonpay.js)
  → server: HMAC of the customer's IP (allowedIpAddress) + URL signature
    → MoonPay widget: KYC, card / Apple Pay payment
      → MoonPay sends crypto on-chain to the customer's Circle wallet
```

## Stack

- **Backend:** Node.js, Express, Circle Developer-Controlled Wallets SDK
- **On/off-ramp:** MoonPay Web SDK (sandbox)
- **Frontend:** HTML, CSS, vanilla JS. No framework.
- **Blockchain:** Ethereum Sepolia testnet
- **Custody:** Shared (MPC) via Circle Programmable Wallets

## Pages

| Route | What it shows |
|---|---|
| `/checkout` | Payment form, confirmation, gas fee, explorer link |
| `/customer` | USDC + ETH balances, transaction history with fees paid |
| `/merchant` | USDC + ETH balances, transaction history (no fees — sender pays) |
| `/buy` | On-ramp: MoonPay widget, crypto delivered to the customer wallet |
| `/sell` | Off-ramp: MoonPay sell widget |
| `/compare` | Card rails vs stablecoin: 13 dimensions side by side |

## Setup

### Prerequisites

- Node.js
- A [Circle developer account](https://console.circle.com) (testnet)
- A [MoonPay developer account](https://dashboard.moonpay.com) (sandbox), for `/buy` and `/sell`

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

Fill in your Circle testnet API key and entity secret. Save your recovery `.dat` file outside the repo — if you lose it, the account is unrecoverable.

For the ramps, add your MoonPay sandbox publishable and secret keys. Take both from the same screen: a mismatched pair fails the signature check. The secret key stays on the server.

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
  buy.html                 On-ramp page
  sell.html                Off-ramp page
  moonpay.js               MoonPay widget: IP binding, server-side signing
  compare.html             Card vs stablecoin comparison table
  style.css                Shared styles
scripts/                   Setup and utility scripts (not part of the running app)
payments.json              Idempotency ledger (gitignored)
```

## Key design decisions

**Idempotency.** Every payment gets a unique key, persisted before the API call. If the server crashes after Circle accepts the transaction, a retry reuses the existing transaction instead of creating a duplicate. Learned this the hard way — a crash during the build caused three identical transfers instead of one.

**Developer-controlled wallets.** The customer never manages keys or signs transactions. Same UX as card checkout: enter amount, click pay. Circle holds half the signing key, the server holds the other half (entity secret).

**Fees displayed per payer.** Customer view shows gas fees on outbound transactions only. Merchant view shows no fees — the sender always pays gas. Each wallet sees only the costs it actually bears.

**Ramp URLs signed server-side.** MoonPay requires an HMAC signature when the widget is pre-filled with a wallet address, plus an HMAC of the customer's IP (`allowedIpAddress`) so a signed URL only works from the device it was made for. Both are computed on the server; the browser never sees the secret key. The signing endpoint only signs MoonPay URLs for this account's publishable key.

## MoonPay sandbox findings

- **Test cards were always declined** ("Payment authorization declined"), whatever the card, account country, IP country or test identity. Apple Pay in test mode is a mock (OK / Cancel dialog) that skips the card processor, and goes through.
- **ERC-20 delivery fails to new wallets.** MoonPay caps its token transfers at 100,000 gas; a first receipt costs ~142,000 on Sepolia. The demo buys Sepolia ETH instead (21,000 gas).
- **The transaction country is the IP country**, not the KYC address. MoonPay also merges Gmail `+` aliases into one customer.
- **Test mode delivers 1/100th** of the quoted amount.

## Lessons from the build

1. Inspect API responses before writing code that depends on them.
2. Build idempotency before the first transaction, not after the first duplicate.
3. Every API call in a payment flow can cost money. A crash after the call does not undo the call.
4. Save provider recovery files immediately. There is no "forgot my password" in shared custody.
5. Know your rate limits before consuming test resources.
6. An on-ramp is card acquiring: issuer declines, 3DS and country risk rules all apply before any crypto moves.
7. Gas depends on what the network does (e.g. creating a new balance entry), not on the amount. A fixed gas limit breaks when costs change: estimate per transaction.
8. Read the provider's real error, not the screen. "Signature check failed" was hiding "Missing allowedIpAddress".

Detailed write-up: https://www.linkedin.com/pulse/im-payments-product-manager-i-built-usdc-checkout-testnet-osada-cscsf/
