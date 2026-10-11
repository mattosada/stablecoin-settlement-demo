// Wraps Circle SDK with idempotent transaction handling.

import crypto from "node:crypto";
import fs from "node:fs";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const LEDGER_PATH = new URL("../payments.json", import.meta.url).pathname;

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Simple file-based ledger: { [idempotencyKey]: transactionId }
function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")); }
  catch { return {}; }
}

function writeLedger(ledger) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

// Transfer USDC with idempotency guarantee.
// Same idempotencyKey → same transaction, no matter how many times you call.
export async function transferUSDC({ from, to, amount, idempotencyKey }) {
  const ledger = readLedger();

  // Already submitted? Resume polling instead of creating a duplicate.
  if (ledger[idempotencyKey]) {
    console.log(`Idempotency hit: reusing transaction ${ledger[idempotencyKey]}`);
    return pollUntilDone(ledger[idempotencyKey]);
  }

  // Get destination address
  const { data: wallet } = await client.getWallet({ id: to });
  const destinationAddress = wallet.wallet.address;

  // Submit transaction
  const { data: tx } = await client.createTransaction({
    walletId: from,
    blockchain: "ETH-SEPOLIA",
    tokenAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    destinationAddress,
    amounts: [String(amount)],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  // Persist BEFORE doing anything else — crash-safe
  ledger[idempotencyKey] = tx.id;
  writeLedger(ledger);

  return pollUntilDone(tx.id);
}

// Poll until CONFIRMED or FAILED
async function pollUntilDone(txId) {
  let tx;
  while (true) {
    const { data } = await client.getTransaction({ id: txId });
    tx = data.transaction;
    if (["COMPLETE", "CONFIRMED", "FAILED", "DENIED"].includes(tx.state)) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return {
    id: tx.id,
    state: tx.state,
    hash: tx.txHash,
    networkFee: tx.networkFee,
    explorerUrl: `https://sepolia.etherscan.io/tx/${tx.txHash}`,
  };
}

export { client };
