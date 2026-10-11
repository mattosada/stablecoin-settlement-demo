// Shows ETH + USDC balances for both wallets.
// Usage: `node scripts/check-balances.js`

import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

async function showBalances(walletId, label) {
  const { data } = await client.getWalletTokenBalance({ id: walletId });
  console.log(`${label}:`);
  if (!data.tokenBalances.length) return console.log("  (empty)\n");
  for (const t of data.tokenBalances) {
    console.log(`  ${t.token.symbol}: ${t.amount}`);
  }
  console.log();
}

await showBalances(process.env.CUSTOMER_WALLET_ID, "Customer");
await showBalances(process.env.MERCHANT_WALLET_ID, "Merchant");
