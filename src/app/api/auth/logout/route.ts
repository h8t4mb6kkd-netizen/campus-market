import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api'
import { buildClearSessionCookie, destroySession, getSessionTokenFromCookieHeader } from '@/lib/auth'

export async function POST(req: Request): Promise<Response> {
  try {
    const token = getSessionTokenFromCookieHeader(req.headers.get('cookie'))
    if (token) await destroySession(token)
    const res = NextResponse.json({ ok: true })
    res.headers.set('Set-Cookie', buildClearSessionCookie())
    return res
  } catch (err) {
    return errorResponse(err)
  }
}
