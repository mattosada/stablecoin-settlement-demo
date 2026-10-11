// Transfers 5 USDC from Customer to Merchant on Sepolia (idempotent).
// Run: `node scripts/transfer.js`
// Run again: same transaction, no duplicate.

import "dotenv/config";
import { transferUSDC } from "../lib/circle.js";

const result = await transferUSDC({
  from: process.env.CUSTOMER_WALLET_ID,
  to: process.env.MERCHANT_WALLET_ID,
  amount: 5,
  idempotencyKey: "demo-payment-001",
});

const ok = result.state === "COMPLETE" || result.state === "CONFIRMED";
console.log(ok ? "✓ Payment confirmed!" : "✗ Failed.");
console.log(`  Explorer: ${result.explorerUrl}`);
