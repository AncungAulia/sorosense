"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@sorosense/vault-client";
import { Button, Keypad, SubHeader, CoinBadge, TransferStatus } from "../ui";
import { ConsentSheet } from "./ConsentSheet";
import { FaucetButton } from "./FaucetButton";
import { useVault } from "../../hooks/useVault";
import { useWallet } from "../../hooks/useWallet";
import { useWalletBalance } from "../../hooks/useWalletBalance";
import { useTransferFlow } from "../../hooks/useTransferFlow";
import { depositorSigner } from "../../lib/vault/signer";
import { toAmount, fromAmount, formatCurrency } from "../../lib/vault/units";
import { stablecoinBySym } from "../../lib/vault/data";
import { recordDeposit } from "../../lib/vault/contributions";

export function DepositKeypad({ sym }: { sym: string }) {
  const router = useRouter();
  const { client, version } = useVault();
  const { address, signTransaction } = useWallet();
  const coin = stablecoinBySym(sym);
  // `currency` is only meaningful for a known coin — never used as a real bucket target
  // when `coin` is undefined (see the `!coin` early return in the render below).
  const currency: Currency = coin?.currency ?? "USD";
  const symbol = currency === "EUR" ? "€" : "$";

  const [amount, setAmount] = useState("0");
  const [frozen, setFrozen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false); // guards the async consent check before the flow starts
  const flow = useTransferFlow();
  // The real trustline balance when Horizon + the issuer are configured; the fixture otherwise (R6).
  // `coin` may be undefined for a typo'd deep link — the hook still runs unconditionally.
  const balance = useWalletBalance(coin?.sym ?? null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pool = await client.activePool(currency);
      const isFrozen = pool ? (await client.poolStatus(pool)) === "frozen" : false;
      if (!cancelled) setFrozen(isFrozen);
    })();
    return () => { cancelled = true; };
    // `version` bumps once the background seed (which may freeze a pool) completes after
    // wallet connect — without it a deep-link render can read poolStatus before the seed
    // lands and wrongly show no amber note (mirrors the fix in useBuckets).
  }, [client, currency, version]);

  // Unknown sym (e.g. a typo'd deep link `/deposit/xyz`): refuse rather than silently
  // defaulting into the USD bucket. All hooks above have already run unconditionally.
  if (!coin) {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title="Deposit" />
        <p className="mt-6 text-center text-[13px] text-muted">Unknown asset.</p>
        <div className="mt-auto">
          <Button onClick={() => router.push("/add-funds")}>Choose an asset</Button>
        </div>
      </div>
    );
  }

  const available = balance.available;
  const entered = toAmount(amount);
  const exceeded = entered > available;

  const quick = (pct: number) => {
    setAmount(fromAmount(BigInt(Math.floor(Number(available) * pct))));
  };

  const doDeposit = async () => {
    if (!address) return;
    const deposited = toAmount(amount);
    await client.deposit(address, currency, deposited).signAndSubmit(depositorSigner(address, signTransaction));
    recordDeposit(currency, deposited); // cost-basis for "Total earned" on Earn
  };

  const onConfirm = async () => {
    if (busy || flow.phase !== "idle" || !address || entered <= 0n || exceeded) return;
    setBusy(true);
    try {
      if (!(await client.hasConsent(address))) { setConsentOpen(true); return; }
      await flow.run(doDeposit);
    } finally {
      setBusy(false);
    }
  };

  const onAgree = () => {
    if (!address) return;
    setConsentOpen(false);
    void flow.run(async () => {
      await client.setPolicyConsent(address).signAndSubmit(depositorSigner(address, signTransaction));
      await doDeposit();
    });
  };

  // Sending / success / error status — the flow's screen replaces the form.
  if (flow.phase !== "idle") {
    return (
      <div className="flex min-h-[calc(100dvh-92px)] flex-col">
        <SubHeader title={`Deposit ${coin.sym}`} />
        <TransferStatus
          phase={flow.phase}
          sendingLabel="Sending your deposit…"
          successTitle="Deposit sent"
          successMessage={`Your ${currency} bucket is now earning. The agent is allocating it.`}
          onDone={() => router.push("/home")}
          errorMessage={flow.error}
          onRetry={flow.retry}
          backLabel={`Back to Deposit ${coin.sym}`}
          onBack={flow.reset}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-92px)] flex-col">
      <SubHeader title={`Deposit ${coin.sym}`} />
      <div className="mb-1.5 text-center">
        <span className="inline-flex h-10 items-center gap-2.5 rounded-full bg-[#ECECEC] pl-2.5 pr-4 text-[15px] font-semibold">
          <CoinBadge token={coin.sym} size={22} />
          {formatCurrency(available, currency)}
        </span>
        {/* Absent unless the backend mounts a faucet and the currency is one it mints (USD/EUR):
            a judge's empty wallet gets test funds here instead of hitting "Not enough balance". */}
        <FaucetButton currency={currency} onMinted={balance.refresh} />
      </div>
      {frozen && (
        <div className="mx-auto mt-0.5 flex max-w-[330px] items-center gap-2 rounded-[14px] bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-medium leading-[1.35] text-warn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          Your {coin.sym} pool is paused. New deposits go to a safe pool.
        </div>
      )}
      <Keypad value={amount} onChange={setAmount} symbol={symbol} onQuick={quick} invalid={exceeded} hint="Not enough balance" />
      <Button onClick={onConfirm} disabled={busy || exceeded || entered <= 0n}>Deposit fund</Button>
      <ConsentSheet open={consentOpen} onAgree={onAgree} onClose={() => setConsentOpen(false)} />
    </div>
  );
}
