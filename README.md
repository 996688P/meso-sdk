# meso-sdk

Read-only client + unsigned transaction builder for **MESO PROTOCOL** on BNB Smart Chain,
plus an **MCP server** so agent frameworks can use the protocol without writing RPC code.

- No private keys. Ever. Every write returns an unsigned `{ to, data, value, chainId }` for the caller's wallet.
- Contracts are source-verified on BscScan. Live state: <https://hongwu.cloud/meso/api/stats>

## Install

```bash
npm i ethers
# then drop meso.js / mcp-server.js into your project, or:
npm i github:<your-org>/meso-sdk
```

## Use as a library

```js
import { MesoClient } from "./meso.js";

const meso = new MesoClient();
const stats = await meso.stats();          // holders, listings, floor, treasury
const token = await meso.token(26);        // owner, stage, rarity, xp, listing
const sales = await meso.listings();       // all active listings, price ascending

// Build (but do not sign) a hatch transaction
const hatchFee = await meso.nft.hatchFee();
const tx = meso.buildHatch({ id: 26, hatchFee });
// tx -> { to, data, value }; sign with your own wallet
```

## Use as an MCP server

Add to your MCP client config (Claude Desktop, Cursor, or any stdio MCP host):

```json
{
  "mcpServers": {
    "meso": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server.js"]
    }
  }
}
```

Tools exposed:

| Tool | Purpose |
|---|---|
| `meso_stats` | Live snapshot: minted, holders, listings, floor, stages, treasury, fees |
| `meso_token` | One specimen: owner, stage, rarity, XP, listing |
| `meso_listings` | All active listings, price ascending |
| `meso_coupon` | Free-mint coupon for a wallet address |
| `meso_build_tx` | Build unsigned tx: mint / mint_with_coupon / hatch / feed / evolve / list / delist / buy / claim |

## Contracts (BNB Smart Chain, chainId 56)

| Name | Address |
|---|---|
| NFT (ERC-721 + ERC-2981) | `0x054237fe97dad04FB51526dB15aA386075054710` |
| Market | `0xc88244FbCEdF927D7BBBc05B8f3090979d903281` |
| Floor fund | `0x297F97be9f16bec1f85c1A8d37b0eca9C9B68dF3` |

## Honest limitations

- Rarity derives from `blockhash(block.number - 1)`, not a verifiable randomness beacon.
- Metadata and art are served from the project domain, not IPFS.
- No floor price is promised; the buyback fund only works while funded.
- `meso_build_tx` never signs. Review every field before broadcasting.

MIT licensed.
