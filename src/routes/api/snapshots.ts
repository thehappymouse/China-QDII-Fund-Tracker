import { createFileRoute } from '@tanstack/react-router'
import { captureSnapshot, fetchSnapshots } from '~/server/snapshot-service'

export const Route = createFileRoute('/api/snapshots')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const limitParam = Number(url.searchParams.get('limit') ?? '30')
        const limit = Number.isFinite(limitParam) ? limitParam : 30

        const data = fetchSnapshots(limit)
        return Response.json({ ok: true, ...data })
      },
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const force = url.searchParams.get('force') === '1'

        const captured = await captureSnapshot({ force })
        if (!captured.ok) {
          const status = force ? 502 : 409
          return Response.json(captured, { status })
        }

        return Response.json(captured)
      },
    },
  },
})
