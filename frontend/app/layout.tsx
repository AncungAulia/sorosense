import type { Metadata, Viewport } from 'next';
import './globals.css';
import { switzer } from '../lib/fonts';
import { WalletProvider } from '../providers/WalletProvider';
import { VaultProvider } from '../providers/VaultProvider';
import { ToastProvider } from '../providers/ToastProvider';

export const metadata: Metadata = {
  title: 'SoroSense',
  description:
    'Non-custodial deposit-to-earn on Stellar, guarded around the clock by an invisible Sentinel safety engine.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning: Stellar Wallets Kit injects theme CSS vars
  // (--swk-*) onto <html> at runtime, which React flags as a hydration
  // mismatch. Standard Next.js escape hatch for third-party html mutation.
  return (
    <html lang="en" className={`${switzer.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <WalletProvider>
          <VaultProvider>
            <ToastProvider>{children}</ToastProvider>
          </VaultProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
