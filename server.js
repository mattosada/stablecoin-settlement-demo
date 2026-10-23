// Settlement demo server.
// Run: `node server.js`

import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import { send, transferUSDC, readLedger, client } from "./lib/circle.js";

const moonpayHmac = (message) =>
  crypto.createHmac("sha256", process.env.MOONPAY_SK_TEST).update(message).digest("base64");

async function moonpayApi(path) {
  const res = await fetch(`https://api.moonpay.com${path}?apiKey=${process.env.MOONPAY_PK_TEST}`, {
    headers: { Authorization: `Api-Key ${process.env.MOONPAY_SK_TEST}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`MoonPay ${res.status}: ${body.message}`);
  return body;
}

const app = express();
app.use(express.static("public"));
app.use(express.json());

// Routes: serve the right HTML for each view
app.get("/checkout", (_, res) => res.sendFile("checkout.html", { root: "public" }));
app.get("/customer", (_, res) => res.sendFile("wallet.html", { root: "public" }));
app.get("/merchant", (_, res) => res.sendFile("wallet.html", { root: "public" }));
app.get("/compare", (_, res) => res.sendFile("compare.html", { root: "public" }));
app.get("/buy", (_, res) => res.sendFile("buy.html", { root: "public" }));
app.get("/sell", (_, res) => res.sendFile("sell.html", { root: "public" }));
app.get("/offramp", (_, res) => res.sendFile("offramp.html", { root: "public" }));

// API: customer wallet address (for MoonPay widget)
app.get("/api/wallet/customer/address", async (_, res) => {
  try {
    const { data: wallet } = await client.getWallet({ id: process.env.CUSTOMER_WALLET_ID });
    res.json({ address: wallet.wallet.address });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: MoonPay publishable key (safe to expose)
app.get("/api/moonpay/key", (_, res) => res.json({ apiKey: process.env.MOONPAY_PK_TEST }));

// API: MoonPay IP binding. Signed widget URLs must carry an HMAC of the customer's public IP.
app.get("/api/moonpay/ip-hash", (req, res) => {
  let ip = req.ip.replace(/^::ffff:/, "");
  // Locally req.ip is loopback, so use the public IP the browser got from MoonPay.
  if (ip === "::1" || ip === "127.0.0.1") ip = req.query.ip;
  if (!ip) return res.status(400).json({ error: "Missing ip" });
  res.json({ allowedIpAddress: moonpayHmac(ip) });
});

// API: MoonPay URL signing (HMAC-SHA256 of the query string, secret key never leaves the server)
app.post("/api/moonpay/sign", (req, res) => {
  const url = new URL(req.body.urlForSignature ?? "about:blank");
  if (!url.hostname.endsWith(".moonpay.com") || url.searchParams.get("apiKey") !== process.env.MOONPAY_PK_TEST) {
    return res.status(400).json({ error: "Not a MoonPay widget URL for this account" });
  }
  res.json({ signature: moonpayHmac(url.search) });
});

// API: off-ramp deposit. Sends the sold ETH from the customer wallet to MoonPay.
// Amount, status and deposit address come from MoonPay's API; the browser's copy must match.
app.post("/api/offramp/deposit", async (req, res) => {
  try {
    const { transactionId, depositWalletAddress } = req.body;
    const sale = await moonpayApi(`/v3/sell_transactions/${encodeURIComponent(transactionId)}`);
    if (sale.status !== "waitingForDeposit" || sale.baseCurrency.code !== "eth") {
      return res.status(409).json({ error: `Sale not awaiting an ETH deposit (status: ${sale.status})` });
    }

    // depositWallet is not in MoonPay's documented schema; verified on a sandbox sale (2026-10-16).
    const moonpayAddress = sale.depositWallet?.walletAddress;
    if (!moonpayAddress || moonpayAddress.toLowerCase() !== String(depositWalletAddress).toLowerCase()) {
      return res.status(409).json({ error: "Deposit address does not match MoonPay's records" });
    }

    const result = await send({
      from: process.env.CUSTOMER_WALLET_ID,
      destinationAddress: moonpayAddress,
      tokenAddress: "",
      amount: sale.baseCurrencyAmount,
      idempotencyKey: `offramp-${sale.id}`,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: off-ramp sales from our ledger, with MoonPay's status and our Circle deposit
app.get("/api/offramp", async (_, res) => {
  try {
    const entries = Object.entries(readLedger()).filter(([key]) => key.startsWith("offramp-"));
    const sales = await Promise.all(entries.map(async ([key, circleTxId]) => {
      const [sale, { data }] = await Promise.all([
        moonpayApi(`/v3/sell_transactions/${encodeURIComponent(key.slice("offramp-".length))}`),
        client.getTransaction({ id: circleTxId }),
      ]);
      const deposit = data.transaction;
      return {
        id: sale.id,
        createdAt: sale.createdAt,
        status: sale.status,
        failureReason: sale.failureReason,
        baseAmount: sale.baseCurrencyAmount,
        baseCode: sale.baseCurrency.code,
        quoteAmount: sale.quoteCurrencyAmount,
        quoteCode: sale.quoteCurrency.code,
        fee: sale.feeAmount,
        payoutMethod: sale.payoutMethod,
        depositReceived: Boolean(sale.depositHash),
        confirmations: sale.confirmations,
        refundApprovalStatus: sale.refundApprovalStatus,
        refundHash: sale.refundHash,
        deposit: { state: deposit.state, hash: deposit.txHash, networkFee: deposit.networkFee },
      };
    }));
    res.json(sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: customer pays merchant in USDC
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

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`http://localhost:${port}/checkout`));
