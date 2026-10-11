// Lists all transactions for both wallets.

import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const { data } = await client.listTransactions({
  walletIds: [process.env.CUSTOMER_WALLET_ID],
});

console.log(`Total transactions: ${data.transactions.length}\n`);
for (const tx of data.transactions) {
  console.log(`  ID:     ${tx.id}`);
  console.log(`  State:  ${tx.state}`);
  console.log(`  Amount: ${tx.amounts?.[0] || "?"} ${tx.tokenId || ""}`);
  console.log(`  Hash:   ${tx.txHash || "none"}`);
  console.log();
}
