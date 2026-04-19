import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DB_PATH = resolve(process.cwd(), 'data', 'china-nasdaq-etf.sqlite')

let db: DatabaseSync | null = null

type SnapshotDbRow = {
  id: number
  captured_at: string
  etf_code: string
  etf_name: string
  etf_price: number
  iopv: number
  iopv2: number
  premium: number
  premium2: number
  usd_cnh: number
  usd_cnh_reference: number
  ndx_fut_price: number
  ndx_fut_reference: number
  ndx_fut_change: number
  source_note: string
}

type CaptureConfigDbRow = {
  id: number
  etf_symbol: string
  fund_code: string
  fx_symbol: string
  futures_symbol: string
  use_estimated_iopv: number
  fx_adjust_weight: number
  futures_adjust_weight: number
  updated_at: string
}

type CaptureLogDbRow = {
  id: number
  captured_at: string
  success: number
  reason: string | null
  force_run: number
  is_capture_minute: number
  elapsed_ms: number
  snapshot_id: number | null
  etf_symbol: string
  fund_code: string
  fx_symbol: string
  futures_symbol: string
}

type TrackedEtfDbRow = {
  id: number
  etf_symbol: string
  fund_code: string
  display_name: string | null
  enabled: number
  sort_order: number
  updated_at: string
}

export type Snapshot = {
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

export type InsertSnapshotInput = {
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
  capturedAt?: string
}

export type CaptureConfig = {
  etfSymbol: string
  fundCode: string
  fxSymbol: string
  futuresSymbol: string
  useEstimatedIopv: boolean
  fxAdjustWeight: number
  futuresAdjustWeight: number
  updatedAt: string
}

export type UpdateCaptureConfigInput = Partial<{
  etfSymbol: string
  fundCode: string
  fxSymbol: string
  futuresSymbol: string
  useEstimatedIopv: boolean
  fxAdjustWeight: number
  futuresAdjustWeight: number
}>

export type TrackedEtf = {
  id: number
  etfSymbol: string
  fundCode: string
  displayName: string | null
  enabled: boolean
  sortOrder: number
  updatedAt: string
}

export type ReplaceTrackedEtfInput = {
  etfSymbol: string
  fundCode: string
  displayName?: string | null
  enabled?: boolean
}

export type CaptureLog = {
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

export type InsertCaptureLogInput = {
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
  capturedAt?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function toSnapshot(row: SnapshotDbRow): Snapshot {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    etfCode: row.etf_code,
    etfName: row.etf_name,
    etfPrice: row.etf_price,
    iopv: row.iopv,
    iopv2: row.iopv2,
    premium: row.premium,
    premium2: row.premium2,
    usdCnh: row.usd_cnh,
    usdCnhReference: row.usd_cnh_reference,
    ndxFutPrice: row.ndx_fut_price,
    ndxFutReference: row.ndx_fut_reference,
    ndxFutChange: row.ndx_fut_change,
    sourceNote: row.source_note,
  }
}

function toCaptureConfig(row: CaptureConfigDbRow): CaptureConfig {
  return {
    etfSymbol: row.etf_symbol,
    fundCode: row.fund_code,
    fxSymbol: row.fx_symbol,
    futuresSymbol: row.futures_symbol,
    useEstimatedIopv: row.use_estimated_iopv === 1,
    fxAdjustWeight: row.fx_adjust_weight,
    futuresAdjustWeight: row.futures_adjust_weight,
    updatedAt: row.updated_at,
  }
}

function toTrackedEtf(row: TrackedEtfDbRow): TrackedEtf {
  return {
    id: row.id,
    etfSymbol: row.etf_symbol,
    fundCode: row.fund_code,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
}

function toCaptureLog(row: CaptureLogDbRow): CaptureLog {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    success: row.success === 1,
    reason: row.reason,
    forceRun: row.force_run === 1,
    isCaptureMinute: row.is_capture_minute === 1,
    elapsedMs: row.elapsed_ms,
    snapshotId: row.snapshot_id,
    etfSymbol: row.etf_symbol,
    fundCode: row.fund_code,
    fxSymbol: row.fx_symbol,
    futuresSymbol: row.futures_symbol,
  }
}

function ensureDefaultConfig(database: DatabaseSync): void {
  const existing = database
    .prepare('SELECT id FROM capture_config WHERE id = 1 LIMIT 1')
    .get() as { id: number } | undefined

  if (existing) {
    return
  }

  database
    .prepare(
      `
      INSERT INTO capture_config (
        id,
        etf_symbol,
        fund_code,
        fx_symbol,
        futures_symbol,
        use_estimated_iopv,
        fx_adjust_weight,
        futures_adjust_weight,
        updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run('sh513100', '513100', 'fx_susdcnh', 'hf_NQ', 0, 1, 1, nowIso())
}

function tableColumns(database: DatabaseSync, tableName: string): Array<string> {
  const rows = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>
  return rows.map((row) => row.name)
}

function ensureSnapshotColumns(database: DatabaseSync): void {
  const columns = tableColumns(database, 'etf_snapshots')

  const addColumn = (name: string, definition: string) => {
    if (!columns.includes(name)) {
      database.exec(`ALTER TABLE etf_snapshots ADD COLUMN ${name} ${definition}`)
      columns.push(name)
    }
  }

  addColumn('etf_name', "TEXT NOT NULL DEFAULT ''")
  addColumn('usd_cnh_reference', 'REAL NOT NULL DEFAULT 0')
  addColumn('ndx_fut_price', 'REAL NOT NULL DEFAULT 0')
  addColumn('ndx_fut_reference', 'REAL NOT NULL DEFAULT 0')
}

function ensureTrackedEtfTable(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tracked_etfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etf_symbol TEXT NOT NULL,
      fund_code TEXT NOT NULL,
      display_name TEXT,
      enabled INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(etf_symbol, fund_code)
    );

    CREATE INDEX IF NOT EXISTS idx_tracked_etfs_sort
      ON tracked_etfs(sort_order ASC, id ASC);
  `)

  const count = database
    .prepare('SELECT COUNT(1) as c FROM tracked_etfs')
    .get() as { c: number }

  if (count.c > 0) {
    return
  }

  const config = database
    .prepare(
      `
      SELECT etf_symbol, fund_code
      FROM capture_config
      WHERE id = 1
    `,
    )
    .get() as { etf_symbol: string; fund_code: string } | undefined

  const etfSymbol = config?.etf_symbol ?? 'sh513100'
  const fundCode = config?.fund_code ?? '513100'

  database
    .prepare(
      `
      INSERT INTO tracked_etfs (
        etf_symbol,
        fund_code,
        display_name,
        enabled,
        sort_order,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(etfSymbol, fundCode, '纳指ETF', 1, 0, nowIso())
}

function getDb(): DatabaseSync {
  if (db) return db

  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new DatabaseSync(DB_PATH)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS etf_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      etf_code TEXT NOT NULL,
      etf_price REAL NOT NULL,
      iopv REAL NOT NULL,
      iopv2 REAL NOT NULL,
      premium REAL NOT NULL,
      premium2 REAL NOT NULL,
      usd_cnh REAL NOT NULL,
      ndx_fut_change REAL NOT NULL,
      source_note TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_etf_snapshots_captured_at
      ON etf_snapshots(captured_at DESC);

    CREATE TABLE IF NOT EXISTS capture_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      etf_symbol TEXT NOT NULL,
      fund_code TEXT NOT NULL,
      fx_symbol TEXT NOT NULL,
      futures_symbol TEXT NOT NULL,
      use_estimated_iopv INTEGER NOT NULL,
      fx_adjust_weight REAL NOT NULL,
      futures_adjust_weight REAL NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capture_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      success INTEGER NOT NULL,
      reason TEXT,
      force_run INTEGER NOT NULL,
      is_capture_minute INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      snapshot_id INTEGER,
      etf_symbol TEXT NOT NULL,
      fund_code TEXT NOT NULL,
      fx_symbol TEXT NOT NULL,
      futures_symbol TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_capture_logs_captured_at
      ON capture_logs(captured_at DESC);

    CREATE INDEX IF NOT EXISTS idx_capture_logs_success
      ON capture_logs(success, captured_at DESC);
  `)

  ensureDefaultConfig(db)
  ensureSnapshotColumns(db)
  ensureTrackedEtfTable(db)

  return db
}

export function ensureSnapshotDb(): void {
  getDb()
}

export function insertSnapshot(input: InsertSnapshotInput): Snapshot {
  const database = getDb()
  const capturedAt = input.capturedAt ?? nowIso()

  const result = database
    .prepare(
      `
      INSERT INTO etf_snapshots (
        captured_at,
        etf_code,
        etf_name,
        etf_price,
        iopv,
        iopv2,
        premium,
        premium2,
        usd_cnh,
        usd_cnh_reference,
        ndx_fut_price,
        ndx_fut_reference,
        ndx_fut_change,
        source_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      capturedAt,
      input.etfCode,
      input.etfName,
      input.etfPrice,
      input.iopv,
      input.iopv2,
      input.premium,
      input.premium2,
      input.usdCnh,
      input.usdCnhReference,
      input.ndxFutPrice,
      input.ndxFutReference,
      input.ndxFutChange,
      input.sourceNote,
    )

  const rowId = Number(result.lastInsertRowid)
  const row = database
    .prepare(
      `
      SELECT id, captured_at, etf_code, etf_name, etf_price, iopv, iopv2, premium, premium2, usd_cnh, usd_cnh_reference, ndx_fut_price, ndx_fut_reference, ndx_fut_change, source_note
      FROM etf_snapshots
      WHERE id = ?
    `,
    )
    .get(rowId) as SnapshotDbRow

  return toSnapshot(row)
}

export function listSnapshots(limit: number): Array<Snapshot> {
  const database = getDb()
  const safeLimit = Math.max(1, Math.min(limit, 500))

  const rows = database
    .prepare(
      `
      SELECT id, captured_at, etf_code, etf_name, etf_price, iopv, iopv2, premium, premium2, usd_cnh, usd_cnh_reference, ndx_fut_price, ndx_fut_reference, ndx_fut_change, source_note
      FROM etf_snapshots
      ORDER BY captured_at DESC
      LIMIT ?
    `,
    )
    .all(safeLimit) as Array<SnapshotDbRow>

  return rows.map(toSnapshot)
}

export function listSnapshotsByEtfCode(etfCode: string, limit: number): Array<Snapshot> {
  const database = getDb()
  const safeLimit = Math.max(1, Math.min(limit, 1000))

  const rows = database
    .prepare(
      `
      SELECT id, captured_at, etf_code, etf_name, etf_price, iopv, iopv2, premium, premium2, usd_cnh, usd_cnh_reference, ndx_fut_price, ndx_fut_reference, ndx_fut_change, source_note
      FROM etf_snapshots
      WHERE etf_code = ?
      ORDER BY captured_at DESC
      LIMIT ?
    `,
    )
    .all(etfCode, safeLimit) as Array<SnapshotDbRow>

  return rows.map(toSnapshot)
}

export function latestSnapshot(): Snapshot | null {
  const database = getDb()

  const row = database
    .prepare(
      `
      SELECT id, captured_at, etf_code, etf_name, etf_price, iopv, iopv2, premium, premium2, usd_cnh, usd_cnh_reference, ndx_fut_price, ndx_fut_reference, ndx_fut_change, source_note
      FROM etf_snapshots
      ORDER BY captured_at DESC
      LIMIT 1
    `,
    )
    .get() as SnapshotDbRow | undefined

  if (!row) {
    return null
  }

  return toSnapshot(row)
}

export function getCaptureConfig(): CaptureConfig {
  const database = getDb()
  const row = database
    .prepare(
      `
      SELECT id, etf_symbol, fund_code, fx_symbol, futures_symbol, use_estimated_iopv, fx_adjust_weight, futures_adjust_weight, updated_at
      FROM capture_config
      WHERE id = 1
    `,
    )
    .get() as CaptureConfigDbRow | undefined

  if (!row) {
    throw new Error('capture_config 缺失')
  }

  return toCaptureConfig(row)
}

export function updateCaptureConfig(input: UpdateCaptureConfigInput): CaptureConfig {
  const database = getDb()
  const current = getCaptureConfig()

  const next: CaptureConfig = {
    etfSymbol: input.etfSymbol ?? current.etfSymbol,
    fundCode: input.fundCode ?? current.fundCode,
    fxSymbol: input.fxSymbol ?? current.fxSymbol,
    futuresSymbol: input.futuresSymbol ?? current.futuresSymbol,
    useEstimatedIopv: input.useEstimatedIopv ?? current.useEstimatedIopv,
    fxAdjustWeight: input.fxAdjustWeight ?? current.fxAdjustWeight,
    futuresAdjustWeight: input.futuresAdjustWeight ?? current.futuresAdjustWeight,
    updatedAt: nowIso(),
  }

  database
    .prepare(
      `
      UPDATE capture_config
      SET etf_symbol = ?,
          fund_code = ?,
          fx_symbol = ?,
          futures_symbol = ?,
          use_estimated_iopv = ?,
          fx_adjust_weight = ?,
          futures_adjust_weight = ?,
          updated_at = ?
      WHERE id = 1
    `,
    )
    .run(
      next.etfSymbol,
      next.fundCode,
      next.fxSymbol,
      next.futuresSymbol,
      next.useEstimatedIopv ? 1 : 0,
      next.fxAdjustWeight,
      next.futuresAdjustWeight,
      next.updatedAt,
    )

  return next
}

export function listTrackedEtfs(): Array<TrackedEtf> {
  const database = getDb()

  const rows = database
    .prepare(
      `
      SELECT id, etf_symbol, fund_code, display_name, enabled, sort_order, updated_at
      FROM tracked_etfs
      ORDER BY sort_order ASC, id ASC
    `,
    )
    .all() as Array<TrackedEtfDbRow>

  return rows.map(toTrackedEtf)
}

export function replaceTrackedEtfs(items: Array<ReplaceTrackedEtfInput>): Array<TrackedEtf> {
  const database = getDb()

  database.exec('BEGIN')
  try {
    database.exec('DELETE FROM tracked_etfs')

    const insert = database.prepare(
      `
      INSERT INTO tracked_etfs (
        etf_symbol,
        fund_code,
        display_name,
        enabled,
        sort_order,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    )

    items.forEach((item, index) => {
      insert.run(
        item.etfSymbol,
        item.fundCode,
        item.displayName ?? null,
        item.enabled === false ? 0 : 1,
        index,
        nowIso(),
      )
    })

    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  return listTrackedEtfs()
}

export function insertCaptureLog(input: InsertCaptureLogInput): CaptureLog {
  const database = getDb()
  const capturedAt = input.capturedAt ?? nowIso()

  const result = database
    .prepare(
      `
      INSERT INTO capture_logs (
        captured_at,
        success,
        reason,
        force_run,
        is_capture_minute,
        elapsed_ms,
        snapshot_id,
        etf_symbol,
        fund_code,
        fx_symbol,
        futures_symbol
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      capturedAt,
      input.success ? 1 : 0,
      input.reason,
      input.forceRun ? 1 : 0,
      input.isCaptureMinute ? 1 : 0,
      input.elapsedMs,
      input.snapshotId,
      input.etfSymbol,
      input.fundCode,
      input.fxSymbol,
      input.futuresSymbol,
    )

  const rowId = Number(result.lastInsertRowid)
  const row = database
    .prepare(
      `
      SELECT id, captured_at, success, reason, force_run, is_capture_minute, elapsed_ms, snapshot_id, etf_symbol, fund_code, fx_symbol, futures_symbol
      FROM capture_logs
      WHERE id = ?
    `,
    )
    .get(rowId) as CaptureLogDbRow

  return toCaptureLog(row)
}

export function listCaptureLogs(
  limit: number,
  options?: {
    failedOnly?: boolean
  },
): Array<CaptureLog> {
  const database = getDb()
  const safeLimit = Math.max(1, Math.min(limit, 500))

  const failedOnly = options?.failedOnly ?? false

  const rows = failedOnly
    ? (database
        .prepare(
          `
          SELECT id, captured_at, success, reason, force_run, is_capture_minute, elapsed_ms, snapshot_id, etf_symbol, fund_code, fx_symbol, futures_symbol
          FROM capture_logs
          WHERE success = 0
          ORDER BY captured_at DESC
          LIMIT ?
        `,
        )
        .all(safeLimit) as Array<CaptureLogDbRow>)
    : (database
        .prepare(
          `
          SELECT id, captured_at, success, reason, force_run, is_capture_minute, elapsed_ms, snapshot_id, etf_symbol, fund_code, fx_symbol, futures_symbol
          FROM capture_logs
          ORDER BY captured_at DESC
          LIMIT ?
        `,
        )
        .all(safeLimit) as Array<CaptureLogDbRow>)

  return rows.map(toCaptureLog)
}

export function dbPath(): string {
  return DB_PATH
}
