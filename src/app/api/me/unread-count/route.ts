import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { countUnreadMessages } from '@/lib/messages'

export async function GET(req: Request): Promise<Response> {
  try {
    const user = await requireUser(req)
    return NextResponse.json({ count: await countUnreadMessages(user.id) })
  } catch (err) {
    return errorResponse(err)
  }
}
