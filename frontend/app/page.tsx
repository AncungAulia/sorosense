"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "../hooks/useWallet";
import { Button } from "../components/ui";
import styles from "./Onboarding.module.css";

const RING_CIRCUMFERENCE = 81.68;

type TourScreen = {
  glow: string;
  title: string;
  body: string;
  svg: ReactNode;
};

const TOUR: TourScreen[] = [
  {
    glow: "rgba(22,163,74,.45)",
    title: "Your money\nearns itself.",
    body: "Deposit a stablecoin. The agent finds the safest, highest yield and compounds it for you, no charts to watch.",
    svg: (
      <svg viewBox="0 0 120 120" width={150} height={150} fill="none">
        <rect x="16" y="76" width="16" height="26" rx="3" stroke="#111316" strokeWidth={3} />
        <rect x="42" y="60" width="16" height="42" rx="3" stroke="#111316" strokeWidth={3} />
        <rect x="68" y="42" width="16" height="60" rx="3" stroke="#111316" strokeWidth={3} />
        <rect x="94" y="24" width="16" height="78" rx="3" fill="#16a34a" />
      </svg>
    ),
  },
  {
    glow: "rgba(192,69,59,.36)",
    title: "A guard that\nnever blinks.",
    body: "Sentinel checks every pool around the clock and moves your money out of danger before it reaches you.",
    svg: (
      <svg viewBox="0 0 120 120" width={150} height={150} fill="none" stroke="#111316" strokeWidth={3}>
        <circle cx="60" cy="60" r="46" opacity={0.22} />
        <circle cx="60" cy="60" r="30" opacity={0.45} />
        <circle cx="60" cy="60" r="14" />
        <circle cx="60" cy="60" r="4" fill="#111316" stroke="none" />
        <circle cx="92" cy="42" r="4.5" fill="#111316" stroke="none" />
        <circle cx="30" cy="48" r="4.5" fill="#111316" stroke="none" />
        <circle cx="42" cy="90" r="4.5" fill="#c0453b" stroke="none" />
      </svg>
    ),
  },
  {
    glow: "rgba(17,19,22,.16)",
    title: "Your keys.\nYour money.",
    body: "Funds stay in a non-custodial vault only you can move. Connect a Stellar wallet to begin.",
    svg: (
      <svg
        viewBox="0 0 120 120"
        width={150}
        height={150}
        fill="none"
        stroke="#111316"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="30" y="54" width="60" height="44" rx="11" />
        <path d="M42 54v-8a18 18 0 0 1 36 0v8" />
        <circle cx="60" cy="73" r="6" />
        <path d="M60 79v7" />
      </svg>
    ),
  },
];

export default function Landing() {
  const router = useRouter();
  const { connect } = useWallet();
  const [inTour, setInTour] = useState(false);
  const [step, setStep] = useState(0);

  async function onConnect() {
    await connect();
    router.push("/home");
  }

  if (!inTour) {
    return (
      <main className="flex min-h-dvh flex-col justify-between px-7 pb-10 pt-24 text-center">
        <div className="inline-flex items-center justify-center gap-2 text-[19px] font-semibold tracking-[-.01em]">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[11px] [background:linear-gradient(180deg,#34383a,#131617)] [box-shadow:0_10px_24px_-10px_rgba(17,19,22,.6),inset_0_1px_0_rgba(255,255,255,.18)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2.2}>
              <path d="M20 4C9 4 4 11 4 20c9 0 16-5 16-16Z" />
            </svg>
          </span>
          SoroSense
        </div>
        <div>
          <h1 className="text-[34px] font-semibold leading-[1.06] tracking-[-.02em]">
            Stablecoin yield,
            <br />
            guarded around
            <br />
            the clock.
          </h1>
          <p className="mx-4 mt-4 text-base text-muted">
            Deposit, and the agent puts your money in the safest yield across Stellar and keeps it out of harm&apos;s
            way, automatically.
          </p>
        </div>
        <div className="grid gap-3">
          <Button
            onClick={() => {
              setStep(0);
              setInTour(true);
            }}
          >
            Get started
          </Button>
          <Button variant="glass" onClick={onConnect}>
            Connect wallet
          </Button>
        </div>
      </main>
    );
  }

  const last = step === TOUR.length - 1;
  const t = TOUR[step];

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex items-center justify-between px-6 pt-[58px]">
        <button
          aria-label="Back"
          onClick={() => (step > 0 ? setStep(step - 1) : setInTour(false))}
          className="grid h-[42px] w-[42px] place-items-center rounded-full border border-white bg-card [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-10px_rgba(17,19,22,.18)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <svg className={styles.ringwrap} viewBox="0 0 30 30" aria-hidden="true">
          <circle className={styles.ringBg} cx="15" cy="15" r="13" />
          <circle
            className={styles.ringFg}
            cx="15"
            cy="15"
            r="13"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - (step + 1) / TOUR.length)}
          />
        </svg>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-9 text-center">
        <div className={styles.tourvis} style={{ ["--glow" as string]: t.glow } as CSSProperties}>
          {t.svg}
        </div>
        <h1 className="whitespace-pre-line text-3xl font-semibold leading-[1.12] tracking-[-.02em]">{t.title}</h1>
        <p className="mx-1.5 mt-3.5 text-base text-muted">{t.body}</p>
      </div>
      <div className="px-[26px] pb-[calc(28px+env(safe-area-inset-bottom))]">
        <Button onClick={() => (last ? onConnect() : setStep(step + 1))}>{last ? "Connect wallet" : "Continue"}</Button>
      </div>
    </main>
  );
}
