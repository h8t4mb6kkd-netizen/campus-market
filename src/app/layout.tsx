import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { ToastProvider } from '@/components/ui/Toast'
import { getSessionUser } from '@/lib/auth'
import { countUnreadMessages } from '@/lib/messages'

export const metadata: Metadata = {
  title: '校园集市 · 校园二手交易平台',
  description: '大学校园二手交易平台：发布闲置、实时沟通、当面交易、互评信誉。',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser((await cookies()).toString())
  const unreadCount = user ? await countUnreadMessages(user.id) : 0
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <ToastProvider>
          <SiteHeader
            user={user ? { username: user.username, avatarUrl: user.avatarUrl, unreadCount } : null}
          />
          <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
        </ToastProvider>
      </body>
    </html>
  )
}
