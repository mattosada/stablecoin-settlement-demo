// Attempts to request test tokens from Circle's faucet API.
// Note: this endpoint requires a mainnet-enabled account.
// Alternative: use the faucet in Circle Console → Programmable Wallets → Faucet.

import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Request test tokens from Circle faucet
async function drip(walletId, label) {
  const url = "https://api.circle.com/v1/faucet/drips";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
    },
    body: JSON.stringify({ walletId, blockchain: "ETH-SEPOLIA" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${label}: ${JSON.stringify(json)}`);
  console.log(`✓ ${label}: faucet request sent`);
}

await drip(process.env.CUSTOMER_WALLET_ID, "Customer");
await drip(process.env.MERCHANT_WALLET_ID, "Merchant");

console.log("\nTokens take ~30s to arrive. Run `node scripts/check-balances.js` to verify.");
