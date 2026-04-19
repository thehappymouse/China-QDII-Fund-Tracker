import { createFileRoute } from '@tanstack/react-router'
import { fetchCaptureLogs } from '~/server/snapshot-service'

export const Route = createFileRoute('/api/capture-logs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const limitParam = Number(url.searchParams.get('limit') ?? '30')
        const limit = Number.isFinite(limitParam) ? limitParam : 30

        const failedOnly = url.searchParams.get('failedOnly') === '1'

        const items = fetchCaptureLogs(limit, { failedOnly })
        return Response.json({ ok: true, items, count: items.length })
      },
    },
  },
})
