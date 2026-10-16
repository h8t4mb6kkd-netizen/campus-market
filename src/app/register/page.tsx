import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { getSessionUser } from '@/lib/auth'

export default async function RegisterPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (user) redirect('/')
  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="mb-6 text-xl font-extrabold">加入校园集市</h1>
      <RegisterForm />
    </div>
  )
}
