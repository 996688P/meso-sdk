#!/usr/bin/env node
// MESO MCP server — stdio JSON-RPC 2.0（换行分隔），无第三方 MCP 依赖。
// 工具只读链上状态并构建未签名交易；服务端不持有任何私钥。
import { createInterface } from "node:readline";
import { MesoClient } from "./meso.js";

const client = new MesoClient();
const SERVER_INFO = { name: "meso-mcp", version: "0.1.0" };
const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "meso_stats",
    description: "Live protocol snapshot: minted, holders, listings, floor, stages, treasury, fees.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "meso_token",
    description: "On-chain state of one specimen: owner, stage, rarity, XP, listing.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer", minimum: 1 } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "meso_listings",
    description: "All active listings sorted by price ascending.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "meso_coupon",
    description: "Request a free-mint coupon (nonce, referrer, signature) for a wallet address.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
        referrer: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
  {
    name: "meso_build_tx",
    description:
      "Build an unsigned transaction for mint, hatch, feed, evolve, list, delist, buy or claim. Returns { to, data, value, chainId }.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["mint", "mint_with_coupon", "hatch", "feed", "evolve", "list", "delist", "buy", "claim"] },
        id: { type: "integer", minimum: 1 },
        priceBnb: { type: "string" },
        nonce: { type: "integer" },
        referrer: { type: "string" },
        signature: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
];

const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const text = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });

async function callTool(name, args = {}) {
  switch (name) {
    case "meso_stats":
      return text(await client.stats());
    case "meso_token":
      return text(await client.token(args.id));
    case "meso_listings":
      return text(await client.listings());
    case "meso_coupon":
      return text(await client.coupon(args.address, args.referrer || "0x0000000000000000000000000000000000000000"));
    case "meso_build_tx": {
      const { action } = args;
      const { ethers } = await import("ethers");
      let tx;
      if (action === "mint") tx = client.buildMint({});
      else if (action === "mint_with_coupon")
        tx = client.buildMintWithCoupon({ nonce: args.nonce, referrer: args.referrer, signature: args.signature });
      else if (action === "hatch") tx = client.buildHatch({ id: args.id, hatchFee: await client.nft.hatchFee() });
      else if (action === "feed") tx = client.buildFeed({ id: args.id, fee: await client.feedFee(args.id) });
      else if (action === "evolve") tx = client.buildEvolve({ id: args.id });
      else if (action === "list") tx = client.buildList({ id: args.id, priceWei: ethers.parseEther(args.priceBnb || "0") });
      else if (action === "delist") tx = client.buildDelist({ id: args.id });
      else if (action === "buy") tx = client.buildBuy({ id: args.id, priceWei: ethers.parseEther(args.priceBnb || "0") });
      else if (action === "claim") tx = client.buildClaim();
      else throw new Error("unknown action: " + action);
      return text({ ...tx, value: String(tx.value), chainId: 56 });
    }
    default:
      throw new Error("unknown tool: " + name);
  }
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions:
        "MESO PROTOCOL on BNB Chain. Read meso_stats first, verify contract addresses, then build transactions. No floor price is promised; rarity derives from block hash.",
    });
  }
  if (method === "notifications/initialized") return null;
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    try {
      const result = await callTool(params?.name, params?.arguments || {});
      return ok(id, result);
    } catch (e) {
      return ok(id, { content: [{ type: "text", text: "error: " + (e?.message || String(e)) }], isError: true });
    }
  }
  return err(id ?? null, -32601, "method not found: " + method);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try {
    msg = JSON.parse(s);
  } catch {
    process.stdout.write(JSON.stringify(err(null, -32700, "parse error")) + "\n");
    return;
  }
  const res = await handle(msg);
  if (res) process.stdout.write(JSON.stringify(res) + "\n");
});
