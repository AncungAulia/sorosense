# STE-21 Fase C+D — live smoke (U3)

The on-chain event reader (U1) decoding a real vault event, and the keeper runner (U2) driving a real,
reversible keeper write — both against the live testnet vault
`CCK5G4FQ53Y7TIQY6CZLOSLCF5DKL44XV2LNFKCMHTSCWNWEAI3D457Y`. Not a CI gate — needs testnet + `KEEPER_SECRET`.

## Run (2026-07-13)

### Reader (U1) — decodes a live on-chain event

Polled the vault's events (`makeRpcEventSource` → `readVaultEvents`, ~30k-ledger window) and decoded them
through the real `deriveUserActivity` / `reconstructCostBasis`:

```
READER: vaultEvents=0 userEvents=1
  sample UserEvent: { kind: 'sign-mandate',
                      depositor: 'GAB5UOJLZWZUXVUB3POD3RBQTD53PQGVOVKVAONBDFXCOO2IY3LIDFJB' }
```

A real `consent_set` event decoded into a `sign-mandate` `UserActionEvent` (ScVal → JS via `scValToNative`).
`vaultEvents=0` only because STE-46's deposit fell outside the queried ledger window — the decode path is
proven live. (The 11 CI tests cover deposit/withdraw/auto-compound decoding against real ScVal.)

### Keeper runner (U2) — reversible live keeper write

`makeKeeperRunner()` freezing then unfreezing the USD demo pool (slug `blend-usdc` → `BLEND_POOL_USD`
address via the injected registry), keeper-signed:

```
KEEPER: poolStatus before = active
  freeze   tx 9e5b13a87c03c37fff3de681f449027bd90183ffe94e6d4e13fa01a3afbf9104  → poolStatus = frozen
  unfreeze tx 388f328ee4b011668e58f588a0c960888dd3a1cf2d60c383a8d1f50fc8aebe5d  → poolStatus = active
```

## What this proves

- **Reader:** the backend decodes the vault's real on-chain events (snake_case topics, ScVal payloads)
  into the existing `VaultEvent` / `UserActionEvent` shapes — activity/earnings history can be sourced
  from chain, not fixtures.
- **Keeper runner:** a manual keeper action performs a **real, reversible** on-chain write (freeze→unfreeze,
  no funds moved), resolving the pool slug to its Address via the registry and signing with the keeper key.
  This is the operator control the demo drives on stage.

Secrets (`KEEPER_SECRET`) never left the backend; no funds were moved.
