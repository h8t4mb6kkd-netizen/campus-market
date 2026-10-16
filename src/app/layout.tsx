import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "校园集市 · 校园二手交易平台",
  description: "大学校园二手交易平台（开发中）",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
