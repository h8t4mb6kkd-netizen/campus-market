import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { commentInclude, toCommentData } from '@/lib/comments'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { commentSchema } from '@/lib/validators'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    const { id } = await ctx.params
    const item = await prisma.item.findUnique({ where: { id }, select: { id: true } })
    if (!item) throw new ApiError('NOT_FOUND', '商品不存在或已删除')

    const { content } = commentSchema.parse(await readJson(req))
    const comment = await prisma.comment.create({
      data: { itemId: id, authorId: user.id, content },
      include: commentInclude,
    })
    return NextResponse.json({ comment: toCommentData(comment) })
  } catch (err) {
    return errorResponse(err)
  }
}
