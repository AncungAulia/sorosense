# STE-45 / STE-21 Fase B — faucet live smoke (U6)

The real faucet minter (`backend/src/http/faucet-minter.ts`) minting a self-issued testnet USDC SAC
(STE-46) end-to-end on live Soroban testnet. Not a CI gate — needs testnet + the issuer secret.

## Run (2026-07-13)

- **Recipient (fresh account):** `GBMDETG2JOPRAXSPFPVQMZZOGKI3EIZUFCQ762XOOS3QD7B23AFO4T5H`
- **Fund:** friendbot → HTTP 200 (XLM)
- **Trustline:** recipient-signed `changeTrust` to `USDC:GDOWW3KRITEDQPL6UHB2NKT35UXY2HKXVYGWI47XZROI2KLBBTEWUL3T` → established
- **Mint:** `makeFaucetMinter().mint(USDC_SAC, recipient, 1000 × 1e7)` (issuer-signed SAC `mint`)
  - tx hash: `8b8666cf85ce34bd3ae50278af12b1c985828de6810572ab434c688389d3cef8`
- **Result:** USDC balance `0.0000000 → 1000.0000000` ✅ **FAUCET_SMOKE_OK**

## What this proves

- The issuer secret (backend-only) signs a live SAC mint; the recipient's balance rises.
- A judge with a fresh wallet + trustline can be funded via `POST /faucet`, so the U20 deposit journey
  no longer dies on a zero-balance panic.
- The no-trustline path (`{ needsChangeTrust: true }`, 409) is the case a recipient hits before the
  `changeTrust` above; the frontend (STE-52) surfaces that hint.

Contract: `CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y` · USDC SAC:
`CDGJ4WQZFY3TH5LX442ZDJVPB5I2VMNEENRX23AYNMJFXLDMZQY5PSKA` · testnet.
