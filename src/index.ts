#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = "https://pro-api.coinmarketcap.com/v1";
const RATE_LIMIT_MS = 500;
let lastRequestTime = 0;

function getKey(): string {
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error("CMC_API_KEY required. Free tier at https://coinmarketcap.com/api/");
  return key;
}

async function cmcFetch(path: string): Promise<any> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  lastRequestTime = Date.now();

  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-CMC_PRO_API_KEY": getKey(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`CMC error: ${res.status}`);
  return res.json();
}

const server = new McpServer({ name: "mcp-coinmarketcap", version: "1.0.0" });

server.tool(
  "get_listings",
  "Get top cryptocurrencies by market cap with prices and stats.",
  {
    limit: z.number().min(1).max(200).default(20),
    sort: z.enum(["market_cap", "volume_24h", "percent_change_24h", "price"]).default("market_cap"),
    convert: z.string().default("USD").describe("Currency to convert to (e.g. 'USD', 'EUR', 'BTC')"),
  },
  async ({ limit, sort, convert }) => {
    const data = await cmcFetch(`/cryptocurrency/listings/latest?limit=${limit}&sort=${sort}&convert=${convert}`);
    const coins = data.data?.map((c: any) => ({
      name: c.name, symbol: c.symbol, rank: c.cmc_rank,
      price: c.quote?.[convert]?.price,
      marketCap: c.quote?.[convert]?.market_cap,
      volume24h: c.quote?.[convert]?.volume_24h,
      change1h: c.quote?.[convert]?.percent_change_1h,
      change24h: c.quote?.[convert]?.percent_change_24h,
      change7d: c.quote?.[convert]?.percent_change_7d,
    }));
    return { content: [{ type: "text" as const, text: JSON.stringify(coins, null, 2) }] };
  }
);

server.tool(
  "get_quote",
  "Get current price and stats for specific cryptocurrencies.",
  {
    symbols: z.string().describe("Comma-separated symbols (e.g. 'BTC,ETH,SOL')"),
    convert: z.string().default("USD"),
  },
  async ({ symbols, convert }) => {
    const data = await cmcFetch(`/cryptocurrency/quotes/latest?symbol=${symbols}&convert=${convert}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data.data, null, 2) }] };
  }
);

server.tool(
  "search_crypto",
  "Search for cryptocurrencies by name or symbol.",
  {
    query: z.string().describe("Search term"),
  },
  async ({ query }) => {
    // Use map endpoint which lists all, then filter client-side
    const data = await cmcFetch(`/cryptocurrency/map?limit=100&sort=cmc_rank`);
    const matches = data.data?.filter((c: any) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.symbol.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 20);
    return { content: [{ type: "text" as const, text: JSON.stringify(matches, null, 2) }] };
  }
);

server.tool(
  "get_global_metrics",
  "Get global cryptocurrency market metrics (total market cap, BTC dominance, etc.).",
  {
    convert: z.string().default("USD"),
  },
  async ({ convert }) => {
    const data = await cmcFetch(`/global-metrics/quotes/latest?convert=${convert}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(data.data, null, 2) }] };
  }
);

server.tool(
  "get_fear_greed",
  "Get the crypto Fear & Greed index (approximated from market data).",
  {},
  async () => {
    // Use free alternative API for fear/greed
    const res = await fetch("https://api.alternative.me/fng/?limit=10");
    const data = await res.json();
    return { content: [{ type: "text" as const, text: JSON.stringify(data.data, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
