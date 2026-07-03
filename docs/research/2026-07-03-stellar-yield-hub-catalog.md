# Stellar Mainnet Yield Catalog — SoroSense Hub

**Probed live 2026-07-03.** Every number below came from a real endpoint hit (DefiLlama yields API, `api.defindex.io`, `amm-api.aqua.network`, Horizon, stellar.expert, issuer TOMLs) — not from articles or assumptions. Full endpoint-level evidence in the three probe reports (paths at bottom). Items that could not be verified are marked UNVERIFIED, not guessed.

## Master table — earn opportunities on Stellar mainnet

### Tier 1 — Permissionless, integrable, real yield (hub core)

| # | Platform | Product / Pool | Asset | APY (live) | TVL | Integration |
|---|---|---|---|---|---|---|
| 1 | Blend V2 | Fixed Pool | USDC | 6.60% | $14.5M | Soroban RPC + `blend-sdk-js` (no REST) |
| 2 | Blend V2 | Fixed Pool | EURC | 6.20% | $818K | same |
| 3 | Blend V2 | Fixed Pool | XLM | 0.06% | $123.8M | same |
| 4 | Gami Labs | earnUSDC | USDC | 7.00% | $14.6M | tracked on yields.llama.fi; no own public API found |
| 5 | Gami Labs | earnXLM | XLM | 3.00% | $3.4M | same |
| 6 | DeFindex | 14 vaults | USDC | 5.8–8.59% | $15.6M total | **open REST API** `api.defindex.io/vault/discover` (no auth) |
| 7 | DeFindex | vaults | EURC | 5.4–6.6% | — | same |
| 8 | DeFindex | vault | XLM | 0.13% | — | same |
| 9 | Ondo | USDY (hold-to-earn T-bill) | USDY | 4.65% | 461M supply, 5,274 holders | permissionless asset; thin liquidity (SDEX + 42 LPs) |
| 10 | Etherfuse | CETES stablebond (hold-to-earn, weekly rebase) | CETES | 5.57% | 61 LPs; listed on Blend/Soroswap | permissionless; the most composable RWA found |

### Tier 2 — Real but gated / thin / no per-pool data

| Platform | What | Status |
|---|---|---|
| Aquarius AMM | 331 live pools, $46M protocol TVL | per-pool TVL/APY fields return **null** (UNVERIFIED per-pool); stable-stable pairs ≈0% base; double-digit APRs sit on volatile pairs (XLM/AQUA) — different risk class |
| Soroswap | AMM + Earn | Deep-probed 2026-07-03: key is free self-serve (JWT, needs admin activation) but the API exposes **no APY/TVL/volume fields** — only raw reserves + quotes (21 endpoints, OpenAPI-verified). AMM LPs earn 0.30% swap fees only, no rewards. **"Soroswap Earn" IS DeFindex under the hood** (same team, PaltaLabs; exact vault-address match `CCKTLDG6I2MM...` @ 5.39% APY) — our DeFindex integration already covers everything Earn shows. A key adds quote/swap-building only, nothing for yield. Protocol TVL $1.24M (DefiLlama, keyless). |
| YLDS (Figure) | yield stablecoin security, ~3.3% (SOFR−35bp) | **KYC-gated** (`auth_required=true`), zero on-chain liquidity |
| BENJI (Franklin Templeton) | tokenized money fund, ~3.0–3.5% | **KYC-gated** (748 unauthorized trustlines), no DEX liquidity |
| WisdomTree CRDT | private credit index | KYC-gated |
| Phoenix AMM | $543K TVL | no public pool API; tiny |
| SDEX native LPs | biggest pool $216K (XLM/AQUA) | thin; Horizon gives reserves, not APY |

### Tier 3 — Dead, traps, or fake (Sentinel show-pieces)

| Item | Reality |
|---|---|
| Blend YieldBlox pool USDC | 4.58% APY on **$186K** — the Feb 2026 $10.8M exploit victim, never recovered |
| Slender | contract live, **$97 TVL** — dead |
| FxDAO | $0 TVL; CDP, not supply-yield |
| MGUSD (MoneyGram) | real + KYC-gated but **issuer keeps the yield** — holder earns nothing |
| USST | the Horizon-listed "USST" is a **squatter asset** (`usst.site`); real STBL unverifiable on-chain today; yield splits to a separate YLD token |
| "XLM staking" | **does not exist natively** (SCP, not PoS); any advertised XLM-staking APY is third-party custodial |
| AAULL1 / ACREDIT | not found on Horizon (UNVERIFIED/nonexistent) |

## What this means for SoroSense

1. **The hub is real.** ~20+ live earn opportunities across 5 permissionless platforms (Blend, Gami, DeFindex, Ondo, Etherfuse), assets: USDC, EURC, XLM, USDY, CETES.
2. **Routing has value again — with real numbers.** Same-asset (USDC), same-shape (supply/vault) spread: Blend 6.60% vs Gami 7.00% vs DeFindex up to 8.59% (~2pp). This supersedes the earlier "only one safe venue" read, which had only compared Blend vs Aquarius stable pairs.
3. **Sentinel earns its keep on real material.** The catalog itself contains the demo: a squatter asset (USST), an issuer-keeps-yield trap (MGUSD), a $97 ghost (Slender), the $186K exploit corpse (YieldBlox), KYC walls (YLDS/BENJI), and thin-liquidity RWAs — exactly what a risk layer filters and explains.
4. **Integration order** (by API openness): DeFindex (open REST) → Blend (SDK) → Gami (Llama-tracked; needs contract-level work) → RWA hold-to-earn (USDY/CETES = just asset swaps + price/rebase tracking) → Aquarius/Soroswap later (data/key gaps).

## Probe evidence (endpoint-level)

- Lending/supply: `scratchpad/grounding/hub-lending-live.md` (session scratch)
- AMM/LP: `scratchpad/grounding/hub-amm-live.md`
- RWA/bonds/staking: `scratchpad/grounding/hub-rwa-live.md`

(Scratch paths live under the session scratchpad; re-run probes to refresh — every claim carries its source URL there.)
