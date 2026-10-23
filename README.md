# Stablecoin Settlement Demo

A USDC checkout on Ethereum Sepolia testnet. Customer pays merchant, settlement in seconds, confirmation on-chain.

Built by a payments PM (cards, acquiring, gateway) to bridge the gap between card rails and stablecoin rails. Testnet only — zero real money.

## What it does

A customer pays a merchant in USDC on Sepolia. The payment is confirmed on-chain in ~15 seconds. Both wallets show balances, transaction history, gas fees paid, and links to the block explorer. A comparison page maps card rail concepts (auth/capture, interchange, chargeback, T+2 settlement) to their stablecoin equivalents.

An on-ramp page lets the customer buy crypto by card through MoonPay (sandbox), delivered on-chain to the same Circle wallet. An off-ramp page lets the customer sell crypto for fiat: the server sends the deposit to MoonPay from the Circle wallet, and a tracking page shows each sale step by step, with who is responsible for it.

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

Off-ramp:

```
Browser (sell.html + moonpay.js)
  → MoonPay widget: KYC, payout method, sale confirmed (status: waitingForDeposit)
    → SDK onInitiateDeposit → POST /api/offramp/deposit
      → server: checks the sale with MoonPay's API (status, amount, deposit address)
        → Circle: sends the ETH from the customer wallet (idempotent per sale)
    → MoonPay: confirmations, conversion, fiat payout
  → /offramp: tracking table per sale (ledger + MoonPay API + Circle API)
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
| `/sell` | Off-ramp: MoonPay sell widget, deposit sent by the server |
| `/offramp` | Off-ramp tracking: one table per sale, each step with its owner and status |
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

In the MoonPay dashboard, add `localhost` to the permitted domains. Without it the widget loads, but never talks to the page: the off-ramp falls back to a manual deposit.

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
  offramp.html             Off-ramp tracking page
  moonpay.js               MoonPay widget: IP binding, server-side signing, SDK handlers
  compare.html             Card vs stablecoin comparison table
  style.css                Shared styles
scripts/                   Setup and utility scripts (not part of the running app)
payments.json              Idempotency ledger (gitignored)
```

## Key design decisions

**Idempotency.** Every transfer has an idempotency key, at two levels. The key (as a UUID derived from it) is sent to Circle, which returns the existing transaction if the same key comes back, even if our server crashed right after the call. The key is also recorded in a local ledger, so a retry resumes the existing transaction without calling Circle again. Off-ramp deposits use the MoonPay sale ID as the key: one sale, at most one deposit. Learned this the hard way — a crash during the build caused three identical transfers instead of one.

**Developer-controlled wallets.** The customer never manages keys or signs transactions. Same UX as card checkout: enter amount, click pay. Circle holds half the signing key, the server holds the other half (entity secret).

**Fees displayed per payer.** Customer view shows gas fees on outbound transactions only. Merchant view shows no fees — the sender always pays gas. Each wallet sees only the costs it actually bears.

**Ramp URLs signed server-side.** MoonPay requires an HMAC signature when the widget is pre-filled with a wallet address, plus an HMAC of the customer's IP (`allowedIpAddress`) so a signed URL only works from the device it was made for. Both are computed on the server; the browser never sees the secret key. The signing endpoint only signs MoonPay URLs for this account's publishable key.

**Off-ramp deposit trusts MoonPay, not the browser.** Before sending crypto, the server fetches the sale from MoonPay's API and takes the amount and deposit address from there. The address reported by the widget must match, or nothing is sent.

## MoonPay sandbox findings

- **Test cards were always declined** ("Payment authorization declined"), whatever the card, account country, IP country or test identity. Apple Pay in test mode is a mock (OK / Cancel dialog) that skips the card processor, and goes through.
- **ERC-20 delivery fails to new wallets.** MoonPay caps its token transfers at 100,000 gas; a first receipt costs ~142,000 on Sepolia. The demo buys Sepolia ETH instead (21,000 gas).
- **The transaction country is the IP country**, not the KYC address. MoonPay also merges Gmail `+` aliases into one customer.
- **Test mode delivers 1/100th** of the quoted amount.

Off-ramp:

- **The deposit works end to end**: widget hand-off, server-side checks, one deposit per sale, received and confirmed by MoonPay.
- **The fiat payout never completed.** The sandbox payout card is a US Visa: a EUR payout failed with "Cross-border payout to this card is not supported", a USD payout with "Card payout failed".
- **Refunds stay "approved" but are never sent.** The deposited ETH is still on MoonPay's deposit addresses days later.
- **One new deposit address per sale.** Sending ETH to a never-used address costs ~205,000 gas on Sepolia, versus 21,000 to an existing one. Circle estimates gas per transaction, so the deposit goes through.
- **SDK handlers need the domain allowlisted** in the MoonPay dashboard. Until then, `onInitiateDeposit` never fires.
- **Not in MoonPay's documented schema:** the sell transaction API returns `depositWallet.walletAddress`, which the server uses to verify the deposit address.

## Lessons from the build

1. Inspect API responses before writing code that depends on them.
2. Build idempotency before the first transaction, not after the first duplicate.
3. Every API call in a payment flow can cost money. A crash after the call does not undo the call.
4. Save provider recovery files immediately. There is no "forgot my password" in shared custody.
5. Know your rate limits before consuming test resources.
6. An on-ramp is card acquiring: issuer declines, 3DS and country risk rules all apply before any crypto moves.
7. Gas depends on what the network does (e.g. creating a new balance entry), not on the amount. A fixed gas limit breaks when costs change: estimate per transaction.
8. Read the provider's real error, not the screen. "Signature check failed" was hiding "Missing allowedIpAddress".
9. The off-ramp ends on card rails too: the payout is a Visa Direct push to a card, with its own cross-border rules. The stablecoin only covers the leg in between.

Detailed write-up: https://www.linkedin.com/pulse/im-payments-product-manager-i-built-usdc-checkout-testnet-osada-cscsf/
