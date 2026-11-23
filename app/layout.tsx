import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Trading Petrunko — Real-time Market Intelligence",
  description:
    "Образовательный дашборд: вероятностный прогноз крипторынка на поиске исторических аналогов. Не является инвестиционной рекомендацией.",
};

export const viewport: Viewport = {
  themeColor: "#050A12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Orbitron:wght@500;600;700;800&family=Rajdhani:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Высота динамической адресной строки телефона — min-height сцен в dvh (Exercise §A) */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--dvh:1dvh; --dvw:1dvw; @supports not (height: 100dvh) { :root { --dvh: 1vh; --dvw: 1vw; } }}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
