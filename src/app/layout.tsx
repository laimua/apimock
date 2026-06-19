import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import GlobalHeader from "@/components/layout/GlobalHeader";

export const metadata: Metadata = {
  title: "ApiMock - API Mock Server",
  description: "Simple and powerful API mocking tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="data-theme" enableSystem defaultTheme="system">
          <GlobalHeader />
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
