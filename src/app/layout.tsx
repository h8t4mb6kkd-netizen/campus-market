import type { Metadata } from 'next'
import './globals.css'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { ToastProvider } from '@/components/ui/Toast'

export const metadata: Metadata = {
  title: '校园集市 · 校园二手交易平台',
  description: '大学校园二手交易平台：发布闲置、实时沟通、当面交易、互评信誉。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <ToastProvider>
          <SiteHeader user={null} />
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  )
}
