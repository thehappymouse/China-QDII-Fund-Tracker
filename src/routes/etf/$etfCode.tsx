import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

export const Route = createFileRoute('/etf/$etfCode')({
  component: EtfDetailPage,
})

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

type SeriesPayload = {
  ok: boolean
  etfCode: string
  latest: Snapshot | null
  items: Array<Snapshot>
  count: number
  reason?: string
}

function EtfDetailPage() {
  const { etfCode } = Route.useParams()

  const [items, setItems] = useState<Array<Snapshot>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        const res = await fetch(
          `/api/snapshots-series?etfCode=${encodeURIComponent(etfCode)}&limit=200`,
        )
        const data = (await res.json()) as SeriesPayload

        if (!res.ok || !data.ok) {
          throw new Error(data.reason ?? '加载ETF序列失败')
        }

        if (!cancelled) {
          setItems(data.items)
          setError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '加载失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [etfCode])

  const series = useMemo(() => [...items].reverse(), [items])
  const latest = items[0] ?? null
  const etfName = latest?.etfName || 'ETF'

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl p-6 md:p-10">
      <div className="mb-4">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← 返回首页
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-blue-600">ETF 详情页</p>
        <h1 className="text-3xl font-bold text-slate-900">
          {etfName} ({etfCode})
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          展示该 ETF 的溢价时间序列、纳指期货采样价与汇率采样价，便于后续校正真实溢价。
        </p>
      </section>

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">加载中...</p>
      ) : error ? (
        <p className="mt-6 text-sm text-rose-600">{error}</p>
      ) : series.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">暂无该 ETF 的历史快照数据。</p>
      ) : (
        <>
          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <MetricCard title="最新价格" value={latest?.etfPrice.toFixed(4) ?? '-'} />
            <MetricCard title="最新溢价" value={latest ? formatPercent(latest.premium) : '-'} />
            <MetricCard title="最新真实溢价2" value={latest ? formatPercent(latest.premium2) : '-'} />
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <ChartCard
              title="溢价 vs 真实溢价2"
              subtitle="premium / premium2"
              series={series}
              getPrimary={(row) => row.premium * 100}
              getSecondary={(row) => row.premium2 * 100}
              unit="%"
            />

            <ChartCard
              title="纳指期货采样价"
              subtitle="ndx_fut_price / ndx_fut_reference"
              series={series}
              getPrimary={(row) => row.ndxFutPrice}
              getSecondary={(row) => row.ndxFutReference}
              unit=""
            />

            <ChartCard
              title="USD/CNH 采样价"
              subtitle="usd_cnh / usd_cnh_reference"
              series={series}
              getPrimary={(row) => row.usdCnh}
              getSecondary={(row) => row.usdCnhReference}
              unit=""
            />

            <ChartCard
              title="ETF 价格 vs IOPV2"
              subtitle="etf_price / iopv2"
              series={series}
              getPrimary={(row) => row.etfPrice}
              getSecondary={(row) => row.iopv2}
              unit=""
            />
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">最近采样明细</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2">时间</th>
                    <th className="px-3 py-2">价格</th>
                    <th className="px-3 py-2">IOPV2</th>
                    <th className="px-3 py-2">溢价</th>
                    <th className="px-3 py-2">真实溢价2</th>
                    <th className="px-3 py-2">NQ现价</th>
                    <th className="px-3 py-2">NQ参考</th>
                    <th className="px-3 py-2">USD/CNH</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 30).map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        {new Date(row.capturedAt).toLocaleString('zh-CN', { hour12: false })}
                      </td>
                      <td className="px-3 py-2">{row.etfPrice.toFixed(4)}</td>
                      <td className="px-3 py-2">{row.iopv2.toFixed(4)}</td>
                      <td className="px-3 py-2 text-emerald-600">{formatPercent(row.premium)}</td>
                      <td className="px-3 py-2 text-blue-600">{formatPercent(row.premium2)}</td>
                      <td className="px-3 py-2">{row.ndxFutPrice.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.ndxFutReference.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {row.usdCnh.toFixed(4)} / {row.usdCnhReference.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function MetricCard(props: { title: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs text-slate-500">{props.title}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{props.value}</p>
    </article>
  )
}

function ChartCard(props: {
  title: string
  subtitle: string
  series: Array<Snapshot>
  getPrimary: (row: Snapshot) => number
  getSecondary: (row: Snapshot) => number
  unit: string
}) {
  const width = 560
  const height = 220

  const primary = props.series.map(props.getPrimary)
  const secondary = props.series.map(props.getSecondary)
  const all = [...primary, ...secondary]

  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1

  const buildPath = (values: Array<number>) => {
    if (values.length === 0) return ''

    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * (width - 24) + 12
        const y = height - ((value - min) / range) * (height - 24) - 12
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
      })
      .join(' ')
  }

  const primaryPath = buildPath(primary)
  const secondaryPath = buildPath(secondary)

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-900">{props.title}</h3>
      <p className="text-xs text-slate-500">{props.subtitle}</p>

      <div className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-2">
        <svg width={width} height={height} className="block">
          <rect x="0" y="0" width={width} height={height} fill="#f8fafc" rx="8" />
          <path d={secondaryPath} fill="none" stroke="#3b82f6" strokeWidth="2" />
          <path d={primaryPath} fill="none" stroke="#10b981" strokeWidth="2" />
        </svg>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />主线
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" />参考线
        </span>
        <span>
          区间: {min.toFixed(4)} ~ {max.toFixed(4)} {props.unit}
        </span>
      </div>
    </article>
  )
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`
}
