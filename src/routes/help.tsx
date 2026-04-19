import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/help')({
  component: HelpPage,
})

function HelpPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl p-6 md:p-10">
      <div className="mb-4">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← 返回首页
        </Link>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-blue-600">帮助文档</p>
        <h1 className="text-3xl font-bold text-slate-900">名词定义、抓取方法与计算规则</h1>
        <p className="mt-3 text-sm text-slate-600">
          本页用于统一说明系统里的关键概念和计算方式，便于后续复核“真实溢价”。
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">一、名词定义</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-medium">ETF 价格：</span>
            二级市场实时成交价格（新浪 ETF 行情）。
          </li>
          <li>
            <span className="font-medium">IOPV（本系统）：</span>
            默认使用基金估值接口中的 <code>dwjz</code>（单位净值），可配置为{' '}
            <code>gsz</code>（估算净值）。
          </li>
          <li>
            <span className="font-medium">IOPV2：</span>
            在 IOPV 基础上叠加当日汇率与纳指期货修正后的参考净值。
          </li>
          <li>
            <span className="font-medium">溢价：</span>
            <code>(ETF价格 - IOPV) / IOPV</code>
          </li>
          <li>
            <span className="font-medium">真实溢价2：</span>
            <code>(ETF价格 - IOPV2) / IOPV2</code>
          </li>
          <li>
            <span className="font-medium">NQ现价 / NQ参考：</span>
            采样时纳指期货实时价格与参考价格（优先昨结，缺失时回退到开盘）。
          </li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">二、抓取方法（当前实现）</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>ETF 行情：新浪 <code>hq.sinajs.cn</code>（按 ETF Symbol 抓取）。</li>
          <li>基金估值（IOPV基础）：天天基金 <code>fundgz.1234567.com.cn</code>。</li>
          <li>USD/CNH：新浪外汇 Symbol（默认 <code>fx_susdcnh</code>）。</li>
          <li>纳指期货：新浪期货 Symbol（默认 <code>hf_NQ</code>）。</li>
          <li>所有原始采样值与计算结果写入本地 SQLite 文件。</li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">三、计算规则</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>
            汇率因子：<code>fxFactor = usdCnh / usdCnhReference</code>
          </p>
          <p>
            期货因子：<code>futFactor = ndxFutPrice / ndxFutReference</code>
          </p>
          <p>
            权重化汇率因子：<code>1 + (fxFactor - 1) × fxAdjustWeight</code>
          </p>
          <p>
            权重化期货因子：<code>1 + (futFactor - 1) × futuresAdjustWeight</code>
          </p>
          <p>
            IOPV2：<code>IOPV × 权重化汇率因子 × 权重化期货因子</code>
          </p>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">四、注意事项</h2>
        <ul className="mt-3 space-y-2 text-sm text-amber-900">
          <li>不同源的时间戳可能存在秒级到分钟级偏差。</li>
          <li>盘前盘后数据、节假日数据需单独解释，不建议直接对比常规交易时段。</li>
          <li>IOPV2 是工程化修正指标，不等同于官方实时净值。</li>
          <li>后续若更换数据源，请先在本页更新定义和规则，避免口径漂移。</li>
        </ul>
      </section>
    </main>
  )
}
