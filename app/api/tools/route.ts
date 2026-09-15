// app/api/tools/route.ts
import { NextResponse } from 'next/server'
import { getToolsForAPI } from '@/lib/tools-server'

export async function GET() {
  const tools = getToolsForAPI()
  return NextResponse.json({ tools })
}