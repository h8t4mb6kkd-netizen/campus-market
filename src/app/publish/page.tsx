import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PublishForm } from '@/components/publish/PublishForm'
import { getSessionUser } from '@/lib/auth'

export default async function PublishPage() {
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect('/login?next=%2Fpublish')
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-extrabold">发布闲置</h1>
      <PublishForm />
    </div>
  )
}
