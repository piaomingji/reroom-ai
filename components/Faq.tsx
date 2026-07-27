import Reveal from './Reveal';

const FAQS = [
  {
    q: '実際の商品の色や柄、システムキッチンの形を正確に再現できますか？',
    a: '参考画像の特徴やデザインを考慮して生成しますが、光の当たり方や画角により実際の商品と多少異なる場合があります。施主様へのリフォーム完成イメージの共有・提案用としてご活用ください。',
  },
  {
    q: '窓や既存の壁・柱の位置を残したまま設備だけを変えられますか？',
    a: 'はい。お部屋の骨組みや間取り、窓の位置関係はそのまま維持しつつ、壁紙や床材、キッチンやトイレなどの設備機器のみを最新のイメージに置き換えます。',
  },
  {
    q: '床・壁・キッチンなど、複数箇所を同時に変更できますか？',
    a: 'はい。各カテゴリ（床材、壁紙、その他設備）にそれぞれの参考画像をアップロードしていただくことで、お部屋全体のトータルコーディネート予想図を一度に生成可能です。',
  },
  {
    q: 'どのような写真をアップロードすると綺麗に生成されますか？',
    a: '部屋全体が明るく、変更したい箇所（壁や床など）が広くはっきりと写っている写真をお使いいただくと、より再現度の高い画像が生成されます。',
  },
  {
    q: '生成した画像は施主様への提案資料（商用）に使えますか？',
    a: 'はい、自由にご利用いただけます。リフォームの提案書、プレゼンボード、店舗での打ち合わせ用画面としてご活用ください。',
  },
  {
    q: 'アップロードした写真や生成された画像はどこに保存されますか？',
    a: '画像処理は安全に行われ、許可なく第三者に公開されることはありません。プライバシーに配慮した設計となっております。',
  },
];

export default function Faq() {
  return (
    <section className="w-full border-t border-line bg-paper-raised">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <Reveal>
          <p className="text-center text-xs font-semibold uppercase tracking-[0.24em] text-clay">
            FAQ
          </p>
          <h2 className="font-display mt-3 text-center text-2xl sm:text-3xl font-bold tracking-tight text-ink md:text-4xl">
            よくある質問
          </h2>
        </Reveal>

        <Reveal delay={100} className="mt-12 flex flex-col gap-3">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-2xl border border-line bg-paper px-4 py-4 sm:px-6 sm:py-5 transition-colors open:border-line-strong"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                {faq.q}
                <span className="text-lg font-light text-ink-faint transition-transform duration-300 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-4 text-sm leading-relaxed text-ink-soft">{faq.a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
