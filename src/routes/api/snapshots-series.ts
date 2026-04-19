import { createFileRoute } from '@tanstack/react-router'
import { fetchSnapshotSeries } from '~/server/snapshot-service'

export const Route = createFileRoute('/api/snapshots-series')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const etfCode = url.searchParams.get('etfCode') ?? ''
          const limitParam = Number(url.searchParams.get('limit') ?? '120')
          const limit = Number.isFinite(limitParam) ? limitParam : 120

          const data = fetchSnapshotSeries(etfCode, limit)
          return Response.json({ ok: true, ...data })
        } catch (error) {
          return Response.json(
            {
              ok: false,
              reason: error instanceof Error ? error.message : '读取序列失败',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
