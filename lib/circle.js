// Wraps Circle SDK with idempotent transaction handling.

import crypto from "node:crypto";
import fs from "node:fs";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const LEDGER_PATH = new URL("../payments.json", import.meta.url).pathname;
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

// Simple file-based ledger: { [idempotencyKey]: transactionId }
export function readLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")); }
  catch { return {}; }
}

function writeLedger(ledger) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

// Circle expects a UUID. Deriving it from our key means a retry after a crash
// hits Circle's own deduplication, even if our ledger write never happened.
function circleIdempotencyKey(key) {
  const h = crypto.createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Send a token from a Circle wallet to any address. tokenAddress "" = native ETH.
// Same idempotencyKey → same transaction, no matter how many times you call.
export async function send({ from, destinationAddress, tokenAddress, amount, idempotencyKey }) {
  const ledger = readLedger();

  // Already submitted? Resume polling instead of creating a duplicate.
  if (ledger[idempotencyKey]) {
    console.log(`Idempotency hit: reusing transaction ${ledger[idempotencyKey]}`);
    return pollUntilDone(ledger[idempotencyKey]);
  }

  const { data: tx } = await client.createTransaction({
    idempotencyKey: circleIdempotencyKey(idempotencyKey),
    walletId: from,
    blockchain: "ETH-SEPOLIA",
    tokenAddress,
    destinationAddress,
    amounts: [String(amount)],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  ledger[idempotencyKey] = tx.id;
  writeLedger(ledger);

  return pollUntilDone(tx.id);
}

// Transfer USDC between two of our Circle wallets.
export async function transferUSDC({ from, to, amount, idempotencyKey }) {
  const { data } = await client.getWallet({ id: to });
  return send({ from, destinationAddress: data.wallet.address, tokenAddress: USDC_ADDRESS, amount, idempotencyKey });
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
