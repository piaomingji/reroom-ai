import Reveal from './Reveal';

const STEPS = [
  {
    no: '01',
    title: '写真のアップロード',
    desc: 'リフォームしたいお部屋の写真をアップロードします。ブラウザ側で自動的に最適化され、安全に送信されます。',
  },
  {
    no: '02',
    title: '空間タイプとスタイルの選択',
    desc: '空間タイプとスタイルを選択します。スタイルを選択しなくても、ご自身で用意した床材や壁紙などの素材画像をアップロードして、オリジナルの組み合わせでデザインが変化する様子を試すことができます。',
  },
  {
    no: '03',
    title: '約10秒で完成予想図を作成',
    desc: '間取り、窓、ドアなどの構造は極力そのまま維持し、壁紙、床材、家具、照明だけを一新した高画質な予想図が生成されます。',
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="w-full border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-clay">
            How it works
          </p>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink md:text-4xl">
            わずか3ステップで作成可能
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.no} delay={i * 100}>
              <div className="flex h-full flex-col rounded-2xl border border-line bg-paper-raised p-7">
                <span className="font-display text-sm font-bold text-clay">
                  {step.no}
                </span>
                <h3 className="font-display mt-5 text-xl font-bold text-ink">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {step.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
