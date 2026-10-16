// Shows ETH + USDC balances for both wallets.
// Usage: `node scripts/check-balances.js`

import "dotenv/config";
import { client } from "../lib/circle.js";

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
