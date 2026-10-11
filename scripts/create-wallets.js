// Creates a wallet set + customer & merchant wallets on Sepolia.
// Run once: `node scripts/create-wallets.js`

import "dotenv/config";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// 1. Create a wallet set (logical group)
const { data: walletSet } = await client.createWalletSet({
  name: "Settlement Demo",
});
console.log("Wallet Set:", walletSet.walletSet.id);

// 2. Create customer + merchant wallets on Sepolia
const { data: wallets } = await client.createWallets({
  walletSetId: walletSet.walletSet.id,
  blockchains: ["ETH-SEPOLIA"],
  count: 2,
  accountType: "EOA",
});

const [customer, merchant] = wallets.wallets;
console.log("\nCustomer wallet:");
console.log("  ID:     ", customer.id);
console.log("  Address:", customer.address);
console.log("\nMerchant wallet:");
console.log("  ID:     ", merchant.id);
console.log("  Address:", merchant.address);

console.log("\n→ Save these IDs in your .env for the next steps.");
