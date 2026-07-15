"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useWallet } from "../hooks/useWallet";
import { Button, CoinBadge, Toast } from "../components/ui";
import type { TokenSym } from "../components/ui/CoinBadge";
import { WalletError, USER_CLOSED_MODAL } from "../lib/wallet-error";
import styles from "./Onboarding.module.css";

type TourScreen = {
  title: string;
  body: string;
  visual: ReactNode;
};

const ONBOARDING_DONE_KEY = "soro.onboarding.done";

const TOUR: TourScreen[] = [
  {
    title: "Deposit multiple\ncurrencies",
    body: "Choose a supported currency and let the app put your funds to work",
    visual: <BucketsVisual />,
  },
  {
    title: "Start earning\nin the background",
    body: "Deposit once and the app places your funds into an earning vault",
    visual: <EarningChartVisual />,
  },
  {
    title: "Review moves\nbefore they happen",
    body: "If something changes, the app pauses first and lets you approve the next move",
    visual: <AgentVisual />,
  },
];

export default function Landing() {
  const router = useRouter();
  const { connect, address, hydrated } = useWallet();
  const [mode, setMode] = useState<"tour" | "connect" | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // A returning user with a re-verified session skips onboarding entirely (STE-43). The wallet is
  // hydrated (and verified) in WalletProvider, so we only react to it here. `replace`, not `push`,
  // keeps the landing out of history so Back from /home doesn't return to onboarding.
  useEffect(() => {
    if (hydrated && address) router.replace("/home");
  }, [hydrated, address, router]);

  useEffect(() => {
    if (!hydrated || address) return;
    let nextMode: "tour" | "connect" = "tour";
    try {
      nextMode = window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1" ? "connect" : "tour";
    } catch {
      nextMode = "tour";
    }
    const id = window.setTimeout(() => setMode(nextMode), 0);
    return () => window.clearTimeout(id);
  }, [hydrated, address]);

  // Auto-dismiss the connect-error toast so it doesn't linger.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  // Keep `/` as a splash/router while WalletProvider re-verifies a saved session.
  if (!hydrated || address || mode === null) return <SplashScreen />;

  async function onConnect() {
    setError(null);
    try {
      await connect();
      router.replace("/home");
    } catch (e) {
      // Dismissing the wallet picker (kit code -1) isn't a failure, so stay quiet.
      if (e instanceof WalletError && e.code === USER_CLOSED_MODAL) return;
      setError(e instanceof Error ? e.message : "Couldn't connect your wallet. Please try again.");
    }
  }

  const finishOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    } catch {
      /* storage can be unavailable; still let the user continue */
    }
    setMode("connect");
  };

  if (mode === "connect") {
    return <ConnectScreen error={error} onBack={() => setMode("tour")} onConnect={onConnect} />;
  }

  const last = step === TOUR.length - 1;
  const t = TOUR[step];

  return (
    <main className={`${styles.screen} ${styles.tourScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          {step > 0 ? (
            <button aria-label="Back" onClick={() => setStep(step - 1)} className={styles.backButton}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          ) : (
            <span aria-hidden="true" className={styles.headerSpacer} />
          )}
          <BrandMark compact />
          <button type="button" className={styles.skipButton} onClick={finishOnboarding}>
            Skip
          </button>
        </header>

        <section className={styles.tourBody}>
          <div key={step} className={styles.visualStage}>
            {t.visual}
          </div>
          <div className={styles.tourCopy}>
            <h1 className={styles.tourTitle}>{t.title}</h1>
            <p className={styles.tourText}>{t.body}</p>
            <Stepper current={step} total={TOUR.length + 1} />
          </div>
        </section>

        <div className={styles.ctaStack}>
          <Button
            onClick={() => {
              if (!last) {
                setStep(step + 1);
                return;
              }
              finishOnboarding();
            }}
          >
            {last ? "Continue" : "Next"}
          </Button>
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function SplashScreen() {
  return (
    <main className={`${styles.screen} ${styles.splashScreen}`} aria-label="Loading SoroSense">
      <BrandMark />
      <span className={styles.splashPulse} aria-hidden="true" />
    </main>
  );
}

function ConnectScreen({ error, onBack, onConnect }: { error: string | null; onBack: () => void; onConnect: () => void }) {
  return (
    <main className={`${styles.screen} ${styles.tourScreen} ${styles.connectScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          <button aria-label="Back" onClick={onBack} className={styles.backButton}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <BrandMark compact />
          <span aria-hidden="true" className={styles.headerSpacer} />
        </header>

        <section className={styles.tourBody}>
          <div key="connect-wallet" className={`${styles.visualStage} ${styles.connectVisualStage}`}>
            <div className={styles.connectVisual} aria-hidden="true">
              <WalletIcon kind="freighter" />
              <WalletIcon kind="walletconnect" />
              <WalletIcon kind="xbull" />
              <WalletIcon kind="rabet" />
              <span className={styles.walletShadow} />
            </div>
          </div>
          <div className={styles.tourCopy}>
            <h1>Connect your wallet</h1>
            <p>Link your Stellar wallet to start earning in the app.</p>
            <Stepper current={3} total={TOUR.length + 1} />
          </div>
        </section>
        <div className={styles.ctaStack}>
          <Button onClick={onConnect}>Connect wallet</Button>
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function WalletIcon({ kind }: { kind: "freighter" | "walletconnect" | "xbull" | "rabet" }) {
  const src = {
    freighter: "/wallets/freighter.png",
    walletconnect: "/wallets/walletconnect.png",
    xbull: "/wallets/xbull.png",
    rabet: "/wallets/rabet.png",
  }[kind];

  return (
    <span className={`${styles.walletFloat} ${styles[`wallet${kind}`]}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static wallet marks must render immediately when the step appears */}
      <img src={src} alt="" className={styles.walletIconImage} />
    </span>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}>
      <Image src="/brand/sorosense-wordmark.svg" alt="SoroSense" width={1105} height={533} className={styles.brandWordmark} priority />
    </div>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div className={styles.stepper} aria-label={`Onboarding step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i === current ? styles.stepActive : ""} />
      ))}
    </div>
  );
}

function BucketsVisual() {
  return (
    <div className={styles.assetStack} aria-hidden="true">
      <AssetRow asset="EURC" tags={["Blend Pool"]} value="$1,240" apy="6.2% APY" token="EURC" loading />
      <AssetRow asset="USDC" tags={["DeFindex"]} value="$5,420" apy="7.8% APY" token="USDC" highlight />
      <AssetRow asset="CETES" tags={["Etherfuse"]} value="$2,416" apy="8.4% APY" token="CETES" loading />
    </div>
  );
}

function AgentVisual() {
  return (
    <div className={styles.agentPanel} aria-hidden="true">
      <div className={styles.phoneMock}>
        <div className={styles.phoneIsland} />
        <div className={styles.phoneContent}>
          <div className={styles.homeHeroMini}>
            <span>Total value</span>
            <b>$2,200.73</b>
            <em>All buckets</em>
          </div>
          <div className={styles.homeButtonMini}>Deposit</div>
          <span className={styles.homeSectionMini}>Buckets</span>
          <HomeBucketMini token="USDC" title="USD bucket" value="$1,116.29" apy="8.59% APY" />
          <HomeBucketMini token="EURC" title="EUR bucket" value="€1,004.09" apy="5.10% APY" />
        </div>
      </div>
      <div className={styles.safeExitCard}>
        <span className={styles.safeExitIcon}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </span>
        <div className={styles.safeExitText}>
          <strong>Your earning is paused</strong>
          <span>Review the move</span>
        </div>
        <b>Review</b>
      </div>
    </div>
  );
}

function EarningChartVisual() {
  const bars = [28, 34, 42, 49, 55, 62, 68, 73, 79, 84, 89, 94];
  return (
    <div className={styles.chartPanel} aria-hidden="true">
      <div className={styles.chartHeader}>
        <div>
          <span>You&apos;re Earning</span>
          <strong>+$42.18</strong>
        </div>
        <b>+7.8% APY</b>
      </div>
      <div className={styles.earningBars}>
        {bars.map((height, i) => (
          <span key={i} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function HomeBucketMini({ token, title, value, apy }: { token: TokenSym; title: string; value: string; apy: string }) {
  return (
    <div className={styles.homeBucketMini}>
      <CoinBadge token={token} size={26} />
      <div>
        <b>{title}</b>
        <span>{token === "USDC" ? "DeFindex" : "Blend"}</span>
      </div>
      <strong>
        {value}
        <small>{apy}</small>
      </strong>
    </div>
  );
}

function AssetRow({
  asset,
  tags,
  value,
  apy,
  token,
  highlight = false,
  loading = false,
}: {
  asset: string;
  tags: string[];
  value: string;
  apy: string;
  token: TokenSym;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`${styles.assetRow} ${highlight ? styles.assetRowActive : ""}`}>
      {loading ? <span className={styles.tokenSkeleton} /> : <CoinBadge token={token} size={44} className={styles.tokenLogo} />}
      {loading ? (
        <>
          <span className={`${styles.assetText} ${styles.assetSkeletonText}`}>
            <i />
            <i />
          </span>
          <span className={`${styles.assetValue} ${styles.assetSkeletonValue}`}>
            <i />
            <i />
          </span>
        </>
      ) : (
        <>
          <span className={styles.assetText}>
            <strong>{asset}</strong>
            <span className={styles.assetTags}>
              {tags.map((tag) => (
                <em key={tag}>{tag}</em>
              ))}
            </span>
          </span>
          <span className={styles.assetValue}>
            <b>{value}</b>
            <small>{apy}</small>
          </span>
        </>
      )}
    </div>
  );
}
