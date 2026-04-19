import {
  dbPath,
  ensureSnapshotDb,
  getCaptureConfig,
  insertCaptureLog,
  insertSnapshot,
  latestSnapshot,
  listCaptureLogs,
  listSnapshots,
  listSnapshotsByEtfCode,
  listTrackedEtfs,
  replaceTrackedEtfs,
  type CaptureConfig,
  type CaptureLog,
  type ReplaceTrackedEtfInput,
  type Snapshot,
  type TrackedEtf,
  type UpdateCaptureConfigInput,
  updateCaptureConfig,
} from './snapshot-db'
import { fetchMarketSnapshotInput } from './market-fetchers'

const CHINA_TIME_ZONE = 'Asia/Shanghai'

type CaptureWindowState = {
  chinaNow: string
  weekDay: number
  minutesOfDay: number
  isTradingDay: boolean
  isTradingTime: boolean
  isCaptureMinute: boolean
}

export type CaptureSetup = {
  config: CaptureConfig
  trackedEtfs: Array<TrackedEtf>
}

function chinaDateParts(now: Date): {
  weekDay: number
  hour: number
  minute: number
  second: number
  chinaNow: string
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CHINA_TIME_ZONE,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const parts = formatter.formatToParts(now)
  const bucket: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      bucket[part.type] = part.value
    }
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  const weekDay = weekdayMap[bucket.weekday]
  const hour = Number(bucket.hour)
  const minute = Number(bucket.minute)
  const second = Number(bucket.second)

  const chinaNow = `${bucket.year}-${bucket.month}-${bucket.day} ${bucket.hour}:${bucket.minute}:${bucket.second}`

  return { weekDay, hour, minute, second, chinaNow }
}

export function getCaptureWindowState(now: Date = new Date()): CaptureWindowState {
  const { weekDay, hour, minute, second, chinaNow } = chinaDateParts(now)

  const minutesOfDay = hour * 60 + minute
  const isTradingDay = weekDay >= 1 && weekDay <= 5

  const inMorning = minutesOfDay >= 9 * 60 + 30 && minutesOfDay <= 11 * 60 + 30
  const inAfternoon = minutesOfDay >= 13 * 60 && minutesOfDay <= 15 * 60

  const isTradingTime = isTradingDay && (inMorning || inAfternoon)
  const isCaptureMinute = isTradingTime && minute % 20 === 0 && second <= 10

  return {
    chinaNow,
    weekDay,
    minutesOfDay,
    isTradingDay,
    isTradingTime,
    isCaptureMinute,
  }
}

export function fetchCaptureSetup(): CaptureSetup {
  ensureSnapshotDb()
  return {
    config: getCaptureConfig(),
    trackedEtfs: listTrackedEtfs(),
  }
}

function ensureNumberInRange(value: number, min: number, max: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${field} 必须是数字`)
  }
  if (value < min || value > max) {
    throw new Error(`${field} 必须在 ${min} - ${max} 之间`)
  }
  return value
}

function normalizeTrackedEtfs(items: Array<ReplaceTrackedEtfInput>): Array<ReplaceTrackedEtfInput> {
  return items.map((item) => {
    const etfSymbol = item.etfSymbol.trim()
    const fundCode = item.fundCode.trim()
    const displayName = item.displayName?.trim() || null

    if (!etfSymbol) {
      throw new Error('trackedEtfs[].etfSymbol 不能为空')
    }
    if (!fundCode) {
      throw new Error('trackedEtfs[].fundCode 不能为空')
    }

    return {
      etfSymbol,
      fundCode,
      displayName,
      enabled: item.enabled !== false,
    }
  })
}

export function saveCaptureSetup(input: {
  config?: UpdateCaptureConfigInput
  trackedEtfs?: Array<ReplaceTrackedEtfInput>
}): CaptureSetup {
  ensureSnapshotDb()

  if (input.config) {
    const normalizedConfig: UpdateCaptureConfigInput = {
      etfSymbol: input.config.etfSymbol?.trim(),
      fundCode: input.config.fundCode?.trim(),
      fxSymbol: input.config.fxSymbol?.trim(),
      futuresSymbol: input.config.futuresSymbol?.trim(),
      useEstimatedIopv: input.config.useEstimatedIopv,
      fxAdjustWeight:
        input.config.fxAdjustWeight === undefined
          ? undefined
          : ensureNumberInRange(input.config.fxAdjustWeight, 0, 3, 'fxAdjustWeight'),
      futuresAdjustWeight:
        input.config.futuresAdjustWeight === undefined
          ? undefined
          : ensureNumberInRange(input.config.futuresAdjustWeight, 0, 3, 'futuresAdjustWeight'),
    }

    if (normalizedConfig.fxSymbol !== undefined && normalizedConfig.fxSymbol.length === 0) {
      throw new Error('fxSymbol 不能为空')
    }
    if (
      normalizedConfig.futuresSymbol !== undefined &&
      normalizedConfig.futuresSymbol.length === 0
    ) {
      throw new Error('futuresSymbol 不能为空')
    }

    updateCaptureConfig(normalizedConfig)
  }

  if (input.trackedEtfs) {
    const normalizedTrackedEtfs = normalizeTrackedEtfs(input.trackedEtfs)
    if (normalizedTrackedEtfs.length === 0) {
      throw new Error('至少保留一个 ETF 配置')
    }

    replaceTrackedEtfs(normalizedTrackedEtfs)
  }

  return fetchCaptureSetup()
}

export async function captureSnapshot(options?: { force?: boolean }): Promise<
  | {
      ok: true
      snapshots: Array<Snapshot>
      failed: number
      window: CaptureWindowState
    }
  | {
      ok: false
      reason: string
      failed: number
      window: CaptureWindowState
    }
> {
  ensureSnapshotDb()

  const startedAt = Date.now()
  const forceRun = options?.force ?? false
  const window = getCaptureWindowState(new Date())
  const config = getCaptureConfig()
  const trackedEtfs = listTrackedEtfs().filter((etf) => etf.enabled)

  if (trackedEtfs.length === 0) {
    return {
      ok: false,
      reason: '没有启用的 ETF，请先在配置中添加并启用 ETF',
      failed: 0,
      window,
    }
  }

  if (!forceRun && !window.isCaptureMinute) {
    const reason =
      '当前不在交易时段的 20 分钟抓取点（规则：09:30-11:30，13:00-15:00，每20分钟）'

    for (const etf of trackedEtfs) {
      insertCaptureLog({
        success: false,
        reason,
        forceRun,
        isCaptureMinute: window.isCaptureMinute,
        elapsedMs: Date.now() - startedAt,
        snapshotId: null,
        etfSymbol: etf.etfSymbol,
        fundCode: etf.fundCode,
        fxSymbol: config.fxSymbol,
        futuresSymbol: config.futuresSymbol,
      })
    }

    return {
      ok: false,
      reason,
      failed: trackedEtfs.length,
      window,
    }
  }

  const snapshots: Array<Snapshot> = []
  let failed = 0
  let firstError: string | null = null

  for (const etf of trackedEtfs) {
    const oneStartedAt = Date.now()

    try {
      const data = await fetchMarketSnapshotInput(config, etf)

      const snapshot = insertSnapshot({
        etfCode: data.etfCode,
        etfName: data.etfName,
        etfPrice: data.etfPrice,
        iopv: data.iopv,
        iopv2: data.iopv2,
        premium: data.premium,
        premium2: data.premium2,
        usdCnh: data.usdCnh,
        usdCnhReference: data.usdCnhReference,
        ndxFutPrice: data.ndxFutPrice,
        ndxFutReference: data.ndxFutReference,
        ndxFutChange: data.ndxFutChange,
        sourceNote: data.sourceNote,
      })

      snapshots.push(snapshot)

      insertCaptureLog({
        success: true,
        reason: null,
        forceRun,
        isCaptureMinute: window.isCaptureMinute,
        elapsedMs: Date.now() - oneStartedAt,
        snapshotId: snapshot.id,
        etfSymbol: etf.etfSymbol,
        fundCode: etf.fundCode,
        fxSymbol: config.fxSymbol,
        futuresSymbol: config.futuresSymbol,
      })
    } catch (error) {
      failed += 1
      const reason = error instanceof Error ? error.message : '抓取失败（未知错误）'
      if (!firstError) {
        firstError = reason
      }

      insertCaptureLog({
        success: false,
        reason,
        forceRun,
        isCaptureMinute: window.isCaptureMinute,
        elapsedMs: Date.now() - oneStartedAt,
        snapshotId: null,
        etfSymbol: etf.etfSymbol,
        fundCode: etf.fundCode,
        fxSymbol: config.fxSymbol,
        futuresSymbol: config.futuresSymbol,
      })
    }
  }

  if (snapshots.length === 0) {
    return {
      ok: false,
      reason: firstError ?? '全部 ETF 抓取失败',
      failed,
      window,
    }
  }

  return {
    ok: true,
    snapshots,
    failed,
    window,
  }
}

export function fetchSnapshots(limit: number): {
  dbPath: string
  latest: Snapshot | null
  items: Array<Snapshot>
  count: number
} {
  ensureSnapshotDb()

  const items = listSnapshots(limit)
  return {
    dbPath: dbPath(),
    latest: items[0] ?? latestSnapshot(),
    items,
    count: items.length,
  }
}

export function fetchSnapshotSeries(etfCode: string, limit: number): {
  etfCode: string
  latest: Snapshot | null
  items: Array<Snapshot>
  count: number
} {
  ensureSnapshotDb()

  const normalized = etfCode.trim()
  if (!normalized) {
    throw new Error('etfCode 不能为空')
  }

  const items = listSnapshotsByEtfCode(normalized, limit)

  return {
    etfCode: normalized,
    latest: items[0] ?? null,
    items,
    count: items.length,
  }
}

export function fetchCaptureLogs(limit: number, options?: { failedOnly?: boolean }): Array<CaptureLog> {
  ensureSnapshotDb()
  return listCaptureLogs(limit, options)
}
