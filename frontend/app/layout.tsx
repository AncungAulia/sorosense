import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sorosense',
  description:
    'Empowering the next generation of traders with actionable market intelligence, risk management, and community insights.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={` h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
