// MESO SDK — 只读查询与未签名交易构建，不持有私钥。
// 依赖：ethers v6
import { ethers } from "ethers";

export const CHAIN_ID = 56;
export const CONTRACTS = {
  nft: "0x054237fe97dad04FB51526dB15aA386075054710",
  market: "0xc88244FbCEdF927D7BBBc05B8f3090979d903281",
  floorFund: "0x297F97be9f16bec1f85c1A8d37b0eca9C9B68dF3",
};

export const ABI_NFT = [
  "function mint() payable",
  "function mintWithCoupon(uint256 nonce, address referrer, bytes signature)",
  "function hatch(uint256 id) payable",
  "function feed(uint256 id) payable",
  "function evolve(uint256 id)",
  "function claim()",
  "function ownerOf(uint256) view returns (address)",
  "function pets(uint256) view returns (uint8 stage,uint8 rarity,uint64 bornAt,uint64 lastFed,uint32 xp)",
  "function stageOf(uint256) view returns (uint8)",
  "function rarityOf(uint256) view returns (uint8)",
  "function xpOf(uint256) view returns (uint32)",
  "function minted() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function ascendedCap() view returns (uint256)",
  "function price() view returns (uint256)",
  "function hatchFee() view returns (uint256)",
  "function hatchDelay() view returns (uint256)",
  "function feedCooldown() view returns (uint256)",
  "function feeHatchling() view returns (uint256)",
  "function feeJuvenile() view returns (uint256)",
  "function feeAdult() view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
];

export const ABI_MARKET = [
  "function list(uint256 tokenId, uint96 price)",
  "function delist(uint256 tokenId)",
  "function buy(uint256 tokenId) payable",
  "function listings(uint256) view returns (address seller,uint96 price,uint64 at)",
  "function feeBps() view returns (uint96)",
];

const STAGE_FEE = { 1: "feeHatchling", 2: "feeJuvenile", 3: "feeAdult" };
const STAGE_NAME = ["Egg", "Hatchling", "Juvenile", "Adult", "Ascended"];
const RARITY_NAME = ["Unrevealed", "Common", "Rare", "Epic", "Legendary"];

export class MesoClient {
  constructor({ rpc = "https://bsc-dataseed.binance.org", statsUrl = "https://hongwu.cloud/meso/api/stats" } = {}) {
    this.provider = new ethers.JsonRpcProvider(rpc, CHAIN_ID, { staticNetwork: true });
    this.nft = new ethers.Contract(CONTRACTS.nft, ABI_NFT, this.provider);
    this.market = new ethers.Contract(CONTRACTS.market, ABI_MARKET, this.provider);
    this.statsUrl = statsUrl;
  }

  /** 站点聚合快照（含持有人、挂单、国库），60 秒缓存 */
  async stats() {
    const r = await fetch(this.statsUrl, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("stats unavailable: " + r.status);
    return r.json();
  }

  /** 单枚样本的链上状态 */
  async token(id) {
    const [owner, pet, listing, uri] = await Promise.all([
      this.nft.ownerOf(id),
      this.nft.pets(id),
      this.market.listings(id),
      this.nft.tokenURI(id).catch(() => null),
    ]);
    return {
      id: Number(id),
      owner,
      stage: Number(pet.stage),
      stageName: STAGE_NAME[Number(pet.stage)],
      rarity: Number(pet.rarity),
      rarityName: RARITY_NAME[Number(pet.rarity)],
      xp: Number(pet.xp),
      bornAt: Number(pet.bornAt),
      lastFed: Number(pet.lastFed),
      listing: listing[1] > 0n ? { seller: listing.seller, priceBnb: ethers.formatEther(listing[1]) } : null,
      tokenURI: uri,
    };
  }

  /** 全部在售（按价格升序） */
  async listings() {
    const minted = Number(await this.nft.minted());
    const out = [];
    for (let i = 1; i <= minted; i++) {
      const l = await this.market.listings(i);
      if (l[1] > 0n) out.push({ tokenId: i, seller: l.seller, priceBnb: ethers.formatEther(l[1]) });
    }
    return out.sort((a, b) => Number(a.priceBnb) - Number(b.priceBnb));
  }

  /** 当前喂养费（按阶段） */
  async feedFee(id) {
    const stage = Number(await this.nft.stageOf(id));
    const fn = STAGE_FEE[stage];
    if (!fn) throw new Error("token is not feedable at stage " + stage);
    return this.nft[fn]();
  }

  /** 免费铸造券（由项目方券服务签发，不碰资金） */
  async coupon(address, referrer = ethers.ZeroAddress) {
    const url = `https://hongwu.cloud/meso/api/coupon?address=${address}&referrer=${referrer}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) throw new Error("coupon failed: " + (j.error || r.status));
    return j;
  }

  // ---- 未签名交易（返回 { to, data, value }，由调用方钱包签名） ----
  buildMint({ price }) {
    return { to: CONTRACTS.nft, data: this.nft.interface.encodeFunctionData("mint", []), value: price ?? 0n };
  }

  buildMintWithCoupon({ nonce, referrer, signature }) {
    return {
      to: CONTRACTS.nft,
      data: this.nft.interface.encodeFunctionData("mintWithCoupon", [nonce, referrer, signature]),
      value: 0n,
    };
  }

  buildHatch({ id, hatchFee }) {
    return { to: CONTRACTS.nft, data: this.nft.interface.encodeFunctionData("hatch", [id]), value: hatchFee };
  }

  buildFeed({ id, fee }) {
    return { to: CONTRACTS.nft, data: this.nft.interface.encodeFunctionData("feed", [id]), value: fee };
  }

  buildEvolve({ id }) {
    return { to: CONTRACTS.nft, data: this.nft.interface.encodeFunctionData("evolve", [id]), value: 0n };
  }

  buildList({ id, priceWei }) {
    return { to: CONTRACTS.market, data: this.market.interface.encodeFunctionData("list", [id, priceWei]), value: 0n };
  }

  buildDelist({ id }) {
    return { to: CONTRACTS.market, data: this.market.interface.encodeFunctionData("delist", [id]), value: 0n };
  }

  buildBuy({ id, priceWei }) {
    return { to: CONTRACTS.market, data: this.market.interface.encodeFunctionData("buy", [id]), value: priceWei };
  }

  buildClaim() {
    return { to: CONTRACTS.nft, data: this.nft.interface.encodeFunctionData("claim", []), value: 0n };
  }
}

export default MesoClient;
