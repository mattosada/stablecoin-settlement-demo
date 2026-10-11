// Settlement demo server.
// Run: `node server.js`

import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import { transferUSDC, client } from "./lib/circle.js";

const app = express();
app.use(express.static("public"));
app.use(express.json());

// Routes: serve the right HTML for each view
app.get("/checkout", (_, res) => res.sendFile("checkout.html", { root: "public" }));
app.get("/customer", (_, res) => res.sendFile("wallet.html", { root: "public" }));
app.get("/merchant", (_, res) => res.sendFile("wallet.html", { root: "public" }));
app.get("/compare", (_, res) => res.sendFile("compare.html", { root: "public" }));

// API: execute payment (idempotent per browser session)
app.post("/api/pay", async (req, res) => {
  try {
    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const result = await transferUSDC({
      from: process.env.CUSTOMER_WALLET_ID,
      to: process.env.MERCHANT_WALLET_ID,
      amount,
      idempotencyKey: `checkout-${crypto.randomUUID()}`,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: wallet balances + transactions
const walletIds = {
  customer: process.env.CUSTOMER_WALLET_ID,
  merchant: process.env.MERCHANT_WALLET_ID,
};

app.get("/api/wallet/:role", async (req, res) => {
  const id = walletIds[req.params.role];
  if (!id) return res.status(404).json({ error: "Unknown role" });

  try {
    const [{ data: balData }, { data: txData }] = await Promise.all([
      client.getWalletTokenBalance({ id }),
      client.listTransactions({ walletIds: [id] }),
    ]);

    // Token ID → symbol (hardcoded for Sepolia, balance data may omit zero-balance tokens)
    const tokenSymbols = {
      "5797fbd6-3795-519d-84ca-ec4c5f80c3b1": "USDC",
      "979869da-9115-5f7d-917d-12d434e56ae7": "ETH",
    };

    res.json({
      balances: balData.tokenBalances.map((b) => ({
        symbol: b.token.symbol,
        amount: b.amount,
      })),
      transactions: txData.transactions
        .filter((tx) => tx.amounts?.[0])
        .map((tx) => ({
          ...tx,
          tokenSymbol: tokenSymbols[tx.tokenId] || tx.tokenId,
        })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log("http://localhost:3000/checkout"));
