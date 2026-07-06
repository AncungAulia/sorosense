import type { Metadata, Viewport } from 'next';
import './globals.css';
import { switzer } from '../lib/fonts';
import { WalletProvider } from '../providers/WalletProvider';

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
  return (
    <html lang="en" className={`${switzer.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
