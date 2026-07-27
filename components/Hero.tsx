import CompareSlider from './CompareSlider';
import Reveal from './Reveal';

const STATS = [
  { value: '10秒', label: '平均生成時間' },
  { value: '5種類', label: 'リフォームスタイル' },
  { value: '通算5回', label: '無料体験' },
];

export default function Hero() {
  return (
    <section id="top" className="relative w-full overflow-hidden">
      {/* 은은한 배경 글로우 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[840px] -translate-x-1/2 rounded-full bg-clay-soft opacity-60 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center md:pt-28">
        <Reveal className="flex flex-col items-center">
          <p className="mb-6 flex items-center gap-2 rounded-full border border-line bg-paper-raised px-4 py-1.5 text-xs font-medium tracking-wide text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-clay" />
            AIリフォーム・インテリア生成スタジオ
          </p>

          <h1 className="font-display max-w-3xl text-4xl font-bold leading-[1.3] tracking-tight text-ink md:text-6xl md:leading-[1.25]">
            写真1枚で、
            <br />
            空間の <em className="not-italic text-clay">完成予想図</em> を瞬時に描く
          </h1>

          <p className="mt-7 max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">
            リフォーム前のお部屋の写真をアップロードしてスタイルを選択するだけで、AIが約10秒で完成予想図を作成。間取りや窓の位置、お部屋の構造はそのままに、新しい空間デザインをご提案します。
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#studio"
              className="rounded-full bg-ink px-8 py-4 text-sm font-semibold text-paper shadow-lift transition-all duration-300 hover:-translate-y-0.5 hover:bg-clay"
            >
              無料で完成予想図を作る
            </a>
            <a
              href="#styles"
              className="rounded-full border border-line-strong bg-paper-raised px-8 py-4 text-sm font-semibold text-ink transition-all duration-300 hover:border-ink"
            >
              スタイルを見る
            </a>
          </div>

          <dl className="mt-12 flex items-center divide-x divide-line">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-3 sm:px-9">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-display text-xl font-bold text-ink md:text-2xl">
                  {stat.value}
                </dd>
                <dd className="mt-1 text-[11px] tracking-wide text-ink-faint">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {/* 쇼케이스 슬라이더 */}
        <Reveal delay={150} className="mt-16 w-full max-w-4xl">
          <CompareSlider
            beforeSrc="/living_room_before.png"
            afterSrc="/living_room_after.png"
            beforeAlt="リフォーム前のご提案写真"
            afterAlt="完成予想図（和モダン）"
            priority
          />
          <p className="mt-4 text-xs text-ink-faint">
            スライダーを左右にドラッグして、リフォーム前後の変化を確認できます。
          </p>
        </Reveal>
      </div>
    </section>
  );
}
