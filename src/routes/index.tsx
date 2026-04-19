import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

type HealthPayload = {
  ok: boolean
  runtime: string
  database: {
    engine: string
    path: string
  }
  schedulerHint: string
  captureWindow: {
    chinaNow: string
    isTradingDay: boolean
    isTradingTime: boolean
    isCaptureMinute: boolean
  }
}

type Snapshot = {
  id: number
  capturedAt: string
  etfCode: string
  etfName: string
  etfPrice: number
  iopv: number
  iopv2: number
  premium: number
  premium2: number
  usdCnh: number
  usdCnhReference: number
  ndxFutPrice: number
  ndxFutReference: number
  ndxFutChange: number
  sourceNote: string
}

type SnapshotPayload = {
  ok: boolean
  dbPath: string
  latest: Snapshot | null
  items: Array<Snapshot>
  count: number
}

type CaptureConfig = {
  etfSymbol: string
  fundCode: string
  fxSymbol: string
  futuresSymbol: string
  useEstimatedIopv: boolean
  fxAdjustWeight: number
  futuresAdjustWeight: number
  updatedAt: string
}

type TrackedEtf = {
  id: number
  etfSymbol: string
  fundCode: string
  displayName: string | null
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

type ConfigPayload = {
  ok: boolean
  config: CaptureConfig
  trackedEtfs: Array<TrackedEtf>
}

type CaptureLog = {
  id: number
  capturedAt: string
  success: boolean
  reason: string | null
  forceRun: boolean
  isCaptureMinute: boolean
  elapsedMs: number
  snapshotId: number | null
  etfSymbol: string
  fundCode: string
  fxSymbol: string
  futuresSymbol: string
}

type CaptureLogsPayload = {
  ok: boolean
  items: Array<CaptureLog>
  count: number
}

type TrackedEtfDraft = {
  etfSymbol: string
  fundCode: string
  displayName: string
  enabled: boolean
}

type CaptureConfigDraft = {
  fxSymbol: string
  futuresSymbol: string
  useEstimatedIopv: boolean
  fxAdjustWeight: string
  futuresAdjustWeight: string
  trackedEtfs: Array<TrackedEtfDraft>
}

function toDraft(config: CaptureConfig, trackedEtfs: Array<TrackedEtf>): CaptureConfigDraft {
  return {
    fxSymbol: config.fxSymbol,
    futuresSymbol: config.futuresSymbol,
    useEstimatedIopv: config.useEstimatedIopv,
    fxAdjustWeight: String(config.fxAdjustWeight),
    futuresAdjustWeight: String(config.futuresAdjustWeight),
    trackedEtfs: trackedEtfs.map((etf) => ({
      etfSymbol: etf.etfSymbol,
      fundCode: etf.fundCode,
      displayName: etf.displayName ?? '',
      enabled: etf.enabled,
    })),
  }
}

function Home() {
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [snapshots, setSnapshots] = useState<Array<Snapshot>>([])
  const [captureLogs, setCaptureLogs] = useState<Array<CaptureLog>>([])
  const [config, setConfig] = useState<CaptureConfig | null>(null)
  const [trackedEtfs, setTrackedEtfs] = useState<Array<TrackedEtf>>([])
  const [draftConfig, setDraftConfig] = useState<CaptureConfigDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    const [healthRes, snapshotRes, configRes, logsRes] = await Promise.all([
      fetch('/api/health'),
      fetch('/api/snapshots?limit=20'),
      fetch('/api/config'),
      fetch('/api/capture-logs?limit=20&failedOnly=1'),
    ])

    if (!healthRes.ok) throw new Error('读取 /api/health 失败')
    if (!snapshotRes.ok) throw new Error('读取 /api/snapshots 失败')
    if (!configRes.ok) throw new Error('读取 /api/config 失败')
    if (!logsRes.ok) throw new Error('读取 /api/capture-logs 失败')

    const healthData = (await healthRes.json()) as HealthPayload
    const snapshotData = (await snapshotRes.json()) as SnapshotPayload
    const configData = (await configRes.json()) as ConfigPayload
    const logsData = (await logsRes.json()) as CaptureLogsPayload

    setHealth(healthData)
    setSnapshots(snapshotData.items)
    setConfig(configData.config)
    setTrackedEtfs(configData.trackedEtfs)
    setDraftConfig(toDraft(configData.config, configData.trackedEtfs))
    setCaptureLogs(logsData.items)
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        await loadData()
        if (!cancelled) setError(null)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const handleManualCapture = async () => {
    try {
      setCapturing(true)
      setError(null)

      const captureRes = await fetch('/api/snapshots?force=1', { method: 'POST' })
      const captureData = (await captureRes.json()) as { ok: boolean; reason?: string }

      if (!captureRes.ok || !captureData.ok) {
        throw new Error(captureData.reason ?? '手动抓取失败')
      }

      await loadData()
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : '手动抓取失败')
    } finally {
      setCapturing(false)
    }
  }

  const handleSaveConfig = async (event: FormEvent) => {
    event.preventDefault()
    if (!draftConfig) return

    const fxAdjustWeight = Number(draftConfig.fxAdjustWeight)
    const futuresAdjustWeight = Number(draftConfig.futuresAdjustWeight)

    if (!Number.isFinite(fxAdjustWeight) || !Number.isFinite(futuresAdjustWeight)) {
      setError('修正权重必须是数字')
      return
    }

    if (draftConfig.trackedEtfs.length === 0) {
      setError('至少保留一个 ETF 配置')
      return
    }

    try {
      setSavingConfig(true)
      setError(null)

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fxSymbol: draftConfig.fxSymbol,
          futuresSymbol: draftConfig.futuresSymbol,
          useEstimatedIopv: draftConfig.useEstimatedIopv,
          fxAdjustWeight,
          futuresAdjustWeight,
          trackedEtfs: draftConfig.trackedEtfs,
        }),
      })

      const payload = (await res.json()) as {
        ok: boolean
        reason?: string
        config?: CaptureConfig
        trackedEtfs?: Array<TrackedEtf>
      }

      if (!res.ok || !payload.ok || !payload.config || !payload.trackedEtfs) {
        throw new Error(payload.reason ?? '配置保存失败')
      }

      setConfig(payload.config)
      setTrackedEtfs(payload.trackedEtfs)
      setDraftConfig(toDraft(payload.config, payload.trackedEtfs))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '配置保存失败')
    } finally {
      setSavingConfig(false)
    }
  }

  const addTrackedEtf = () => {
    if (!draftConfig) return
    setDraftConfig({
      ...draftConfig,
      trackedEtfs: [
        ...draftConfig.trackedEtfs,
        {
          etfSymbol: '',
          fundCode: '',
          displayName: '',
          enabled: true,
        },
      ],
    })
  }

  const removeTrackedEtf = (index: number) => {
    if (!draftConfig) return
    setDraftConfig({
      ...draftConfig,
      trackedEtfs: draftConfig.trackedEtfs.filter((_, i) => i !== index),
    })
  }

  const updateTrackedEtf = (
    index: number,
    patch: Partial<TrackedEtfDraft>,
  ) => {
    if (!draftConfig) return
    setDraftConfig({
      ...draftConfig,
      trackedEtfs: draftConfig.trackedEtfs.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    })
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl p-6 md:p-10">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          多 ETF 配置 + 采样上下文
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          中国纳指 ETF 溢价追踪台
        </h1>
        <p className="mt-4 max-w-4xl text-slate-600">
          现在支持配置多个纳指 ETF，并记录采样时的纳指期货价格、参考价、汇率参考价。快照里会保留 ETF 中文名称，方便后续校正真实溢价。
        </p>
        <div className="mt-4">
          <Link
            to="/help"
            className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            查看帮助页面（名词解释 / 抓取方法 / 计算规则）
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">抓取配置</h2>

        {!draftConfig ? (
          <p className="mt-2 text-sm text-slate-500">配置加载中...</p>
        ) : (
          <form onSubmit={handleSaveConfig} className="mt-4 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                FX Symbol
                <input
                  value={draftConfig.fxSymbol}
                  onChange={(e) => setDraftConfig({ ...draftConfig, fxSymbol: e.target.value })}
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="fx_susdcnh"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Futures Symbol
                <input
                  value={draftConfig.futuresSymbol}
                  onChange={(e) =>
                    setDraftConfig({ ...draftConfig, futuresSymbol: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="hf_NQ"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-700">
                汇率修正权重 (0~3)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="3"
                  value={draftConfig.fxAdjustWeight}
                  onChange={(e) =>
                    setDraftConfig({ ...draftConfig, fxAdjustWeight: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-700">
                期货修正权重 (0~3)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="3"
                  value={draftConfig.futuresAdjustWeight}
                  onChange={(e) =>
                    setDraftConfig({ ...draftConfig, futuresAdjustWeight: e.target.value })
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draftConfig.useEstimatedIopv}
                onChange={(e) =>
                  setDraftConfig({ ...draftConfig, useEstimatedIopv: e.target.checked })
                }
              />
              使用 gsz（估算净值）作为 IOPV 基准（否则使用 dwjz）
            </label>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">跟踪 ETF 列表</h3>
                <button
                  type="button"
                  onClick={addTrackedEtf}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  + 添加 ETF
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-2 py-2">启用</th>
                      <th className="px-2 py-2">ETF Symbol</th>
                      <th className="px-2 py-2">Fund Code</th>
                      <th className="px-2 py-2">中文名称（可覆盖）</th>
                      <th className="px-2 py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftConfig.trackedEtfs.map((row, index) => (
                      <tr key={`${row.etfSymbol}-${row.fundCode}-${index}`} className="border-b border-slate-100">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) => updateTrackedEtf(index, { enabled: e.target.checked })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={row.etfSymbol}
                            onChange={(e) =>
                              updateTrackedEtf(index, { etfSymbol: e.target.value })
                            }
                            className="w-40 rounded border border-slate-300 px-2 py-1"
                            placeholder="sh513100"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={row.fundCode}
                            onChange={(e) =>
                              updateTrackedEtf(index, { fundCode: e.target.value })
                            }
                            className="w-32 rounded border border-slate-300 px-2 py-1"
                            placeholder="513100"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={row.displayName}
                            onChange={(e) =>
                              updateTrackedEtf(index, { displayName: e.target.value })
                            }
                            className="w-52 rounded border border-slate-300 px-2 py-1"
                            placeholder="纳指ETF国泰"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeTrackedEtf(index)}
                            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingConfig}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingConfig ? '保存中...' : '保存配置'}
              </button>

              <button
                type="button"
                onClick={() => config && setDraftConfig(toDraft(config, trackedEtfs))}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                还原到当前配置
              </button>

              {config ? (
                <span className="text-xs text-slate-500">
                  上次更新：
                  {new Date(config.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                </span>
              ) : null}
            </div>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">后端状态</h2>
          <button
            type="button"
            onClick={handleManualCapture}
            disabled={capturing}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {capturing ? '抓取中...' : '手动抓取一次（force=1）'}
          </button>
        </div>

        {loading ? (
          <p className="mt-2 text-sm text-slate-500">加载中...</p>
        ) : error ? (
          <p className="mt-2 text-sm text-rose-600">{error}</p>
        ) : health ? (
          <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <p>
              <span className="font-medium">运行时：</span>
              {health.runtime}
            </p>
            <p>
              <span className="font-medium">数据库：</span>
              {health.database.engine}
            </p>
            <p className="md:col-span-2">
              <span className="font-medium">SQLite 文件：</span>
              {health.database.path}
            </p>
            <p>
              <span className="font-medium">中国时间：</span>
              {health.captureWindow.chinaNow}
            </p>
            <p>
              <span className="font-medium">当前是否抓取槽位：</span>
              {health.captureWindow.isCaptureMinute ? '是' : '否'}
            </p>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">最近抓取失败日志</h2>
          <span className="text-xs text-slate-500">/api/capture-logs?failedOnly=1</span>
        </div>

        {captureLogs.length === 0 ? (
          <p className="text-sm text-slate-500">暂无失败日志（很棒）。</p>
        ) : (
          <div className="space-y-2">
            {captureLogs.map((log) => (
              <article key={log.id} className="rounded-lg border border-rose-100 bg-rose-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-700">
                  <span>{new Date(log.capturedAt).toLocaleString('zh-CN', { hour12: false })}</span>
                  <span>耗时 {log.elapsedMs}ms</span>
                </div>
                <p className="mt-1 text-sm font-medium text-rose-800">{log.reason ?? '未知错误'}</p>
                <p className="mt-1 text-xs text-rose-700">
                  {log.etfSymbol} / {log.fundCode}
                  {log.forceRun ? ' · force' : ''}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">最近快照</h2>
          <span className="text-xs text-slate-500">包含期货实时价与参考价</span>
        </div>

        {snapshots.length === 0 ? (
          <p className="text-sm text-slate-500">当前暂无快照记录，点击上方按钮先抓取一次。</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">ETF</th>
                    <th className="px-3 py-2 font-medium">价格</th>
                    <th className="px-3 py-2 font-medium">IOPV</th>
                    <th className="px-3 py-2 font-medium">IOPV2</th>
                    <th className="px-3 py-2 font-medium">USD/CNH</th>
                    <th className="px-3 py-2 font-medium">NQ现价</th>
                    <th className="px-3 py-2 font-medium">NQ参考</th>
                    <th className="px-3 py-2 font-medium">溢价</th>
                    <th className="px-3 py-2 font-medium">真实溢价2</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        {new Date(row.capturedAt).toLocaleString('zh-CN', { hour12: false })}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to="/etf/$etfCode"
                          params={{ etfCode: row.etfCode }}
                          className="inline-flex flex-col hover:underline"
                        >
                          <span className="font-medium text-blue-700">{row.etfCode}</span>
                          <span className="text-xs text-slate-400">{row.etfName || '-'}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2">{row.etfPrice.toFixed(4)}</td>
                      <td className="px-3 py-2">{row.iopv.toFixed(4)}</td>
                      <td className="px-3 py-2">{row.iopv2.toFixed(4)}</td>
                      <td className="px-3 py-2">
                        {row.usdCnh.toFixed(4)} / {row.usdCnhReference.toFixed(4)}
                      </td>
                      <td className="px-3 py-2">{row.ndxFutPrice.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.ndxFutReference.toFixed(2)}</td>
                      <td className="px-3 py-2 text-emerald-600">{formatPercent(row.premium)}</td>
                      <td className="px-3 py-2 text-blue-600">{formatPercent(row.premium2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">最新来源：{snapshots[0]?.sourceNote}</p>
          </>
        )}
      </section>
    </main>
  )
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
}
