import './globals.css';

export const metadata = {
  title: 'CryptoCroc Scanner',
  description: 'Live TradingView indicator scanner',
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
