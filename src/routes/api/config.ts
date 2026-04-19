import { createFileRoute } from '@tanstack/react-router'
import { fetchCaptureSetup, saveCaptureSetup } from '~/server/snapshot-service'

export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async () => {
        const setup = fetchCaptureSetup()
        return Response.json({ ok: true, ...setup })
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>

          const trackedEtfsRaw = Array.isArray(body.trackedEtfs) ? body.trackedEtfs : undefined

          const setup = saveCaptureSetup({
            config: {
              fxSymbol: typeof body.fxSymbol === 'string' ? body.fxSymbol : undefined,
              futuresSymbol:
                typeof body.futuresSymbol === 'string' ? body.futuresSymbol : undefined,
              useEstimatedIopv:
                typeof body.useEstimatedIopv === 'boolean' ? body.useEstimatedIopv : undefined,
              fxAdjustWeight:
                typeof body.fxAdjustWeight === 'number' ? body.fxAdjustWeight : undefined,
              futuresAdjustWeight:
                typeof body.futuresAdjustWeight === 'number' ? body.futuresAdjustWeight : undefined,
            },
            trackedEtfs: trackedEtfsRaw
              ? trackedEtfsRaw.map((item) => {
                  const row = item as Record<string, unknown>
                  return {
                    etfSymbol: typeof row.etfSymbol === 'string' ? row.etfSymbol : '',
                    fundCode: typeof row.fundCode === 'string' ? row.fundCode : '',
                    displayName: typeof row.displayName === 'string' ? row.displayName : null,
                    enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
                  }
                })
              : undefined,
          })

          return Response.json({ ok: true, ...setup })
        } catch (error) {
          return Response.json(
            {
              ok: false,
              reason: error instanceof Error ? error.message : '配置保存失败',
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
