import type { CaptureConfig, TrackedEtf } from './snapshot-db'

const SINA_QUOTE_URL = 'https://hq.sinajs.cn/list='
const TIANTIAN_FUND_GZ_URL = 'https://fundgz.1234567.com.cn/js/'

type SinaQuoteResult = {
  symbol: string
  fields: Array<string>
}

type EtfQuote = {
  etfCode: string
  latestPrice: number
  previousClose: number
}

type FundIopvQuote = {
  fundCode: string
  fundName: string
  iopvDisplay: number
  iopvEstimated: number
  navDate: string
  estimateTime: string
}

type FxQuote = {
  latest: number
  reference: number
}

type FuturesQuote = {
  latest: number
  reference: number
}

export type MarketSnapshotInput = {
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

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function asNumber(value: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw new Error(`无法解析数字: ${value}`)
  }
  return numeric
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)

  try {
    const response = await fetch(url, {
      headers: {
        Referer: 'https://finance.sina.com.cn',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} when fetching ${url}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function parseSinaLine(line: string): SinaQuoteResult | null {
  const match = line.match(/^var hq_str_([^=]+)="([\s\S]*)";$/)
  if (!match) {
    return null
  }

  const symbol = match[1]
  const payload = match[2]
  if (!payload) {
    return { symbol, fields: [] }
  }

  return {
    symbol,
    fields: payload.split(','),
  }
}

async function fetchSinaQuotes(symbols: Array<string>): Promise<Record<string, Array<string>>> {
  const url = `${SINA_QUOTE_URL}${symbols.join(',')}`
  const text = await fetchText(url)

  const map: Record<string, Array<string>> = {}
  const lines = text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

  for (const line of lines) {
    const parsed = parseSinaLine(line)
    if (!parsed) continue
    map[parsed.symbol] = parsed.fields
  }

  return map
}

async function fetchEtfQuote(etfSymbol: string): Promise<EtfQuote> {
  const quotes = await fetchSinaQuotes([etfSymbol])
  const fields = quotes[etfSymbol]
  if (!fields || fields.length < 4) {
    throw new Error(`ETF 行情为空或字段不足: ${etfSymbol}`)
  }

  const previousClose = asNumber(fields[2])
  const latestPrice = asNumber(fields[3])

  return {
    etfCode: etfSymbol.replace(/^sh|^sz/, ''),
    latestPrice,
    previousClose,
  }
}

async function fetchFundIopv(fundCode: string): Promise<FundIopvQuote> {
  const url = `${TIANTIAN_FUND_GZ_URL}${fundCode}.js`
  const text = await fetchText(url)

  const match = text.match(/jsonpgz\((\{[\s\S]*\})\);?/)
  if (!match) {
    throw new Error(`无法解析天天基金估值返回: ${fundCode}`)
  }

  const payload = JSON.parse(match[1]) as {
    fundcode: string
    name: string
    dwjz: string
    gsz: string
    jzrq: string
    gztime: string
  }

  const iopvDisplay = asNumber(payload.dwjz)
  const iopvEstimated = asNumber(payload.gsz)

  return {
    fundCode: payload.fundcode,
    fundName: payload.name,
    iopvDisplay,
    iopvEstimated,
    navDate: payload.jzrq,
    estimateTime: payload.gztime,
  }
}

async function fetchUsdCnh(fxSymbol: string): Promise<FxQuote> {
  const quotes = await fetchSinaQuotes([fxSymbol])
  const fields = quotes[fxSymbol]
  if (!fields || fields.length < 9) {
    throw new Error(`USD/CNH 行情为空或字段不足: ${fxSymbol}`)
  }

  const latest = asNumber(fields[1])

  const maybeReference = Number(fields[8])
  const reference = Number.isFinite(maybeReference) && maybeReference > 0 ? maybeReference : latest

  return { latest, reference }
}

async function fetchNasdaqFutures(futuresSymbol: string): Promise<FuturesQuote> {
  const quotes = await fetchSinaQuotes([futuresSymbol])
  const fields = quotes[futuresSymbol]
  if (!fields || fields.length < 9) {
    throw new Error(`纳指期货行情为空或字段不足: ${futuresSymbol}`)
  }

  const latest = asNumber(fields[0])
  const previousSettlement = Number(fields[7])
  const open = Number(fields[8])

  const fallback = Number.isFinite(open) && open > 0 ? open : latest
  const reference =
    Number.isFinite(previousSettlement) && previousSettlement > 0
      ? previousSettlement
      : fallback

  return {
    latest,
    reference,
  }
}

export async function fetchMarketSnapshotInput(
  config: CaptureConfig,
  trackedEtf: TrackedEtf,
): Promise<MarketSnapshotInput> {
  const [etf, fundIopv, fx, futures] = await Promise.all([
    fetchEtfQuote(trackedEtf.etfSymbol),
    fetchFundIopv(trackedEtf.fundCode),
    fetchUsdCnh(config.fxSymbol),
    fetchNasdaqFutures(config.futuresSymbol),
  ])

  const fxFactor = fx.latest / fx.reference
  const futuresFactor = futures.latest / futures.reference

  const weightedFxFactor = 1 + (fxFactor - 1) * config.fxAdjustWeight
  const weightedFuturesFactor = 1 + (futuresFactor - 1) * config.futuresAdjustWeight

  const iopvBase = config.useEstimatedIopv ? fundIopv.iopvEstimated : fundIopv.iopvDisplay
  const iopv2Raw = iopvBase * weightedFxFactor * weightedFuturesFactor
  const iopv2 = round(iopv2Raw, 4)

  const premium = round((etf.latestPrice - iopvBase) / iopvBase, 6)
  const premium2 = round((etf.latestPrice - iopv2) / iopv2, 6)
  const ndxFutChange = round(futuresFactor - 1, 6)

  const etfName = trackedEtf.displayName?.trim() || fundIopv.fundName || trackedEtf.fundCode

  return {
    etfCode: etf.etfCode,
    etfName,
    etfPrice: round(etf.latestPrice, 4),
    iopv: round(iopvBase, 4),
    iopv2,
    premium,
    premium2,
    usdCnh: round(fx.latest, 6),
    usdCnhReference: round(fx.reference, 6),
    ndxFutPrice: round(futures.latest, 3),
    ndxFutReference: round(futures.reference, 3),
    ndxFutChange,
    sourceNote: [
      `etf:sina(${trackedEtf.etfSymbol})`,
      `iopv:tiantian(${fundIopv.navDate} / ${fundIopv.estimateTime} / ${
        config.useEstimatedIopv ? 'gsz' : 'dwjz'
      })`,
      `fx:sina(${config.fxSymbol})*${config.fxAdjustWeight}`,
      `futures:sina(${config.futuresSymbol})*${config.futuresAdjustWeight}`,
      `etfPrevClose:${etf.previousClose}`,
    ].join(' | '),
  }
}
