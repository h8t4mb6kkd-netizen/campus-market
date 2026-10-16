import { NextResponse } from 'next/server'
import { ApiError, errorResponse, readJson } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureSameOrigin } from '@/lib/origin'
import { verificationSchema } from '@/lib/validators'

export async function POST(req: Request): Promise<Response> {
  try {
    ensureSameOrigin(req)
    const user = await requireUser(req)
    if (user.verifiedAt) throw new ApiError('CONFLICT', '你已经通过学生认证了')

    const pending = await prisma.verificationRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    })
    if (pending) throw new ApiError('CONFLICT', '你有一条待审核的申请，请耐心等待')

    const input = verificationSchema.parse(await readJson(req))
    const request = await prisma.verificationRequest.create({
      data: { userId: user.id, studentNo: input.studentNo, proofImageUrl: input.proofImageUrl },
    })
    return NextResponse.json({ request: { id: request.id, status: request.status } })
  } catch (err) {
    return errorResponse(err)
  }
}
