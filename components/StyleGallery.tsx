import Reveal from './Reveal';
import StyleCards from './StyleCards';

export default function StyleGallery() {
  return (
    <section id="styles" className="w-full border-t border-line bg-paper-raised">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-clay">
            Styles
          </p>
          <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink md:text-4xl">
            多様なスタイルによるリフォーム完成イメージ
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft md:text-base">
            和モダンからインダストリアルまで。同じ部屋が選択したスタイルによってどのように生まれ変わるか、実際のイメージをご覧ください。
          </p>
        </Reveal>

        <StyleCards />
      </div>
    </section>
  );
}
