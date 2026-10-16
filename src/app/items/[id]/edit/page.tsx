import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { PublishForm } from '@/components/publish/PublishForm'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser((await cookies()).toString())
  if (!user) redirect(`/login?next=${encodeURIComponent(`/items/${id}/edit`)}`)

  const item = await prisma.item.findUnique({ where: { id }, include: { images: { orderBy: { sort: 'asc' } } } })
  if (!item) notFound()
  if (item.sellerId !== user.id) redirect(`/items/${id}`)
  if (item.status !== 'ON_SALE' && item.status !== 'RESERVED') redirect(`/items/${id}`)

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-extrabold">编辑商品</h1>
      <PublishForm
        itemId={item.id}
        initial={{
          title: item.title,
          description: item.description,
          priceYuan: item.priceCents / 100,
          negotiable: item.negotiable,
          category: item.category,
          condition: item.condition,
          location: item.location,
          images: item.images.map(({ url, width, height }) => ({ url, width, height })),
        }}
      />
    </div>
  )
}
