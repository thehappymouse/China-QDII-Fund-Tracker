import { createFileRoute } from '@tanstack/react-router'
import { dbPath, ensureSnapshotDb } from '~/server/snapshot-db'
import { getCaptureWindowState } from '~/server/snapshot-service'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        ensureSnapshotDb()
        const captureWindow = getCaptureWindowState(new Date())

        return Response.json({
          ok: true,
          runtime: 'nodejs',
          database: {
            engine: 'sqlite',
            path: dbPath(),
          },
          schedulerHint: '每20分钟抓取一次（交易时段内）',
          captureWindow,
          nowUtc: new Date().toISOString(),
        })
      },
    },
  },
})
