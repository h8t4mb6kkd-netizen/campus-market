import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import { getSessionUser } from '@/lib/auth'

export default async function LoginPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (user) redirect('/')
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="mb-6 text-xl font-extrabold">欢迎回来</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
