'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { FREE_GENERATIONS, ROOM_TYPES, STYLES } from '@/lib/constants';
import { useLocalStorage } from '@/lib/useLocalStorage';
import CompareSlider from './CompareSlider';
import Reveal from './Reveal';

const LOADING_STATUSES = [
  '空間構造を分析中...',
  'スタイル要素を配置中...',
  '照明と色彩を調整中...',
  '高画質レンダリングを作成中...',
];

export default function Studio() {
  // 입력 상태
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState(ROOM_TYPES[0].id);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);

  // カテゴリ別参考画像の状態
  const [refFlooring, setRefFlooring] = useState<string | null>(null);
  const [refWallpaper, setRefWallpaper] = useState<string | null>(null);
  const [refKitchen, setRefKitchen] = useState<string | null>(null);

  // Drag & drop status for each
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragOverFlooring, setIsDragOverFlooring] = useState(false);
  const [isDragOverWallpaper, setIsDragOverWallpaper] = useState(false);
  const [isDragOverKitchen, setIsDragOverKitchen] = useState(false);

  // Refs for inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const flooringFileInputRef = useRef<HTMLInputElement>(null);
  const wallpaperFileInputRef = useRef<HTMLInputElement>(null);
  const kitchenFileInputRef = useRef<HTMLInputElement>(null);

  // 무료 체험 횟수 + BYOK (localStorage와 동기화)
  const [freeCountRaw, setFreeCountRaw] = useLocalStorage(
    'reroom_free_generations',
    String(FREE_GENERATIONS)
  );
  const freeCount = Number(freeCountRaw);
  const [userPlan] = useLocalStorage('reroom_user_plan', 'free');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [byokModeRaw] = useLocalStorage('reroom_byok_mode', 'false');
  const byokMode = byokModeRaw === 'true';
  const [byokKey] = useLocalStorage('reroom_byok_key', '');
  // 同時ログイン監視用セッションID
  const [sessionId, setSessionId] = useState<string>('');

  // 생성 상태
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [generationTime, setGenerationTime] = useState<number | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // セッションIDの読み込みまたは生成
    if (typeof window !== 'undefined') {
      let currentSessId = localStorage.getItem('reroom_session_id');
      if (!currentSessId) {
        currentSessId = `SESS-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        localStorage.setItem('reroom_session_id', currentSessId);
      }
      setSessionId(currentSessId);
    }

    // 스타일 ギャラリーカードからスタイルを事前に選択した時
    const onPickStyle = (e: Event) => {
      const styleId = (e as CustomEvent<string>).detail;
      if (STYLES.some((s) => s.id === styleId)) {
        setSelectedStyle(styleId);
        setResultImage(null);
      }
    };
    window.addEventListener('reroom:style', onPickStyle);
    return () => window.removeEventListener('reroom:style', onPickStyle);
  }, []);

  // アップロード画像前処理 — Canvasで長い辺を1024pxにダウンスケール
  const handleImageFile = (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('画像ファイル（JPG、PNG、WebP）のみアップロードできます。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('ファイルサイズは10MBを超過できません。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setUploadedImage(canvas.toDataURL('image/jpeg', 0.85));
          setResultImage(null);
          setErrorMsg(null);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 参考画像の前処理 — Canvasで長い辺を1024pxにダウンスケール（カテゴリ指定可能）
  const handleRefImageFile = (file: File, category: 'flooring' | 'wallpaper' | 'kitchen') => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('参考画像は画像ファイル（JPG、PNG、WebP）のみアップロードできます。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('参考画像のファイルサイズは10MBを超過できません。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (category === 'flooring') setRefFlooring(dataUrl);
          else if (category === 'wallpaper') setRefWallpaper(dataUrl);
          else if (category === 'kitchen') setRefKitchen(dataUrl);
          
          setResultImage(null);
          setErrorMsg(null);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!uploadedImage) {
      setErrorMsg('リフォーム前の元となるお部屋の写真をアップロードしてください。');
      return;
    }

    if (!selectedStyle && !refFlooring && !refWallpaper && !refKitchen) {
      setErrorMsg('リフォームスタイル、または参考画像を1つ以上指定してください。');
      return;
    }

    // Limit check for non-BYOK and non-pro/business users
    if (!byokMode && userPlan !== 'pro' && userPlan !== 'business' && freeCount <= 0) {
      setShowUpgradeModal(true);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setResultImage(null);
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % LOADING_STATUSES.length);
    }, 2500);
    const startTime = Date.now();

    // Determine if the user is premium
    const isPremiumUser = userPlan === 'pro' || userPlan === 'business' || (userPlan === 'quota' && freeCount > 0);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        credentials: 'omit',
        body: JSON.stringify({
          image: uploadedImage,
          roomTypeId: selectedRoom,
          styleId: selectedStyle,
          byokKey: byokMode ? byokKey.trim() : null,
          refFlooring: refFlooring || null,
          refWallpaper: refWallpaper || null,
          refKitchen: refKitchen || null,
          isPremiumUser,
          userPlan,
          quotaRemaining: freeCount,
          sessionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.error === 'MULTIPLE_SESSIONS_DETECTED') {
          localStorage.setItem('reroom_user_plan', 'free');
          window.dispatchEvent(new Event('storage'));
          window.dispatchEvent(new Event('wallai:plan_updated'));
          alert('別端末で同時ログインが検出されたため、この端末のセッションが終了しました。複数名で同時に利用する場合は「法人プラン」をご検討ください。');
          window.location.reload();
          return;
        }
        throw new Error(data.error || '完成予想図の生成に失敗しました。');
      }

      setResultImage(`data:image/png;base64,${data.image}`);
      setGenerationTime(Number(((Date.now() - startTime) / 1000).toFixed(1)));

      // 画面の高さ縮小に伴う料金プランへの意図しないスクロールジャンプを防ぎ、完成予想図画面へフォーカス
      setTimeout(() => {
        document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      if (!byokMode && userPlan !== 'pro') {
        const nextCount = Math.max(0, freeCount - 1);
        setFreeCountRaw(String(nextCount));
        
        // Dispatch storage event to sync count globally
        window.dispatchEvent(new Event('storage'));
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : '完成予想図の生成中にエラーが発生しました。もう一度お試しください。'
      );
    } finally {
      clearInterval(interval);
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultImage) return;

    try {
      // base64データをBlob形式にデコード
      const parts = resultImage.split(';base64,');
      const contentType = parts[0].split(':')[1];
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const uInt8Array = new Uint8Array(rawLength);
      
      for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      
      const blob = new Blob([uInt8Array], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        // スマホでは新規タブ（またはブラウザの標準ビューア）で開き、長押しで端末に保存できるようにする
        window.open(blobUrl, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `reroom_${selectedRoom}_${selectedStyle}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      // 10秒後にオブジェクトURLをメモリから解放
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (e) {
      console.error('Download wrapper failed, using fallback:', e);
      // フォールバック: 最悪の場合でも画像のみを表示する新規タブを開く
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`<img src="${resultImage}" style="max-width: 100%; height: auto;" alt="完成予想図" />`);
      }
    }
  };

  const resetResult = () => {
    setResultImage(null);
    setGenerationTime(null);
    setTimeout(() => {
      document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const resetAll = () => {
    setUploadedImage(null);
    setResultImage(null);
    setGenerationTime(null);
    setErrorMsg(null);
    setRefFlooring(null);
    setRefWallpaper(null);
    setRefKitchen(null);
    setTimeout(() => {
      document.getElementById('studio')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <section id="studio" className="w-full scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-clay">
                Studio
              </p>
              <h2 className="font-display mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-ink md:text-4xl">
                完成予想図作成スタジオ
              </h2>
            </div>
          </div>
        </Reveal>

        <Reveal delay={100} className="mt-10">
          <div className="rounded-3xl border border-line bg-paper-raised p-4 sm:p-6 shadow-lift md:p-10">
            {resultImage && uploadedImage ? (
              /* ── 生成完了結果 ── */
              <div id="preview-section" className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 animate-fade-in scroll-mt-24">
                <div className="text-center">
                  <span className="rounded-full bg-clay px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-paper">
                    Redesign Complete
                  </span>
                  <h3 className="font-display mt-4 text-2xl font-bold text-ink">
                    新しいリフォーム案が完成しました
                  </h3>
                  <p className="mt-1.5 text-xs text-ink-faint">
                    {selectedStyle ? `${STYLES.find((s) => s.id === selectedStyle)?.label}スタイル` : 'スタイル指定なし'} ・ 生成時間{' '}
                    {generationTime}秒
                  </p>
                  {(refFlooring || refWallpaper || refKitchen) && (
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft">
                        使用した参考画像
                      </span>
                      <div className="flex justify-center gap-4">
                        {refFlooring && (
                          <div className="flex flex-col items-center gap-1">
                            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-line shadow-sm">
                              <Image src={refFlooring} alt="床材参考画像" fill className="object-cover" />
                            </div>
                            <span className="text-[9px] font-medium text-ink-soft">床材</span>
                          </div>
                        )}
                        {refWallpaper && (
                          <div className="flex flex-col items-center gap-1">
                            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-line shadow-sm">
                              <Image src={refWallpaper} alt="壁紙参考画像" fill className="object-cover" />
                            </div>
                            <span className="text-[9px] font-medium text-ink-soft">壁紙</span>
                          </div>
                        )}
                        {refKitchen && (
                          <div className="flex flex-col items-center gap-1">
                            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-line shadow-sm">
                              <Image src={refKitchen} alt="その他・設備参考画像" fill className="object-cover" />
                            </div>
                            <span className="text-[9px] font-medium text-ink-soft">その他・設備</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <CompareSlider
                  beforeSrc={uploadedImage}
                  afterSrc={resultImage}
                  beforeAlt="リフォーム前（元の写真）"
                  afterAlt="完成予想図"
                />

                <div className="flex w-full flex-col sm:flex-row justify-center gap-3">
                  <button
                    onClick={handleDownload}
                    className="w-full sm:w-auto cursor-pointer text-center rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-paper shadow-lift transition-all duration-200 hover:bg-clay active:scale-95"
                  >
                    高画質PNGをダウンロード
                  </button>
                  <button
                    onClick={resetResult}
                    className="w-full sm:w-auto cursor-pointer text-center rounded-full border border-line-strong bg-paper-raised px-6 py-3.5 text-sm font-semibold text-ink transition-all duration-200 hover:border-ink active:scale-95"
                  >
                    別のスタイルで再生成
                  </button>
                  <button
                    onClick={resetAll}
                    className="w-full sm:w-auto cursor-pointer text-center rounded-full px-6 py-3.5 text-sm font-semibold text-ink-soft transition-colors hover:text-ink"
                  >
                    別の写真をアップロード
                  </button>
                </div>
              </div>
            ) : (
              /* ── 入力段階 ── */
              <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-12">
                {/* 01. アップロード */}
                <div className="flex flex-col gap-3">
                  <label className="flex items-baseline gap-2 text-sm sm:text-base font-bold text-ink">
                    <span className="font-display text-sm text-clay">01</span>
                    リフォーム前のお部屋の写真をアップロード
                  </label>

                  {!uploadedImage ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        if (e.dataTransfer.files?.[0]) handleImageFile(e.dataTransfer.files[0]);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition-all duration-300 ${
                        isDragOver
                          ? 'scale-[0.99] border-clay bg-clay-soft'
                          : 'border-line-strong bg-paper hover:border-ink-faint'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={(e) => {
                          if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
                          e.target.value = '';
                        }}
                      />
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        className="text-ink-faint"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="9" cy="9" r="1.8" fill="currentColor" />
                        <path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          ファイルをドラッグ＆ドロップ、またはクリックしてアップロード
                        </p>
                        <p className="mt-1.5 text-xs text-ink-faint">
                          JPG・PNG・WebP、最大10MB
                          <br />
                          アップロード時に1024pxに自動で最適化されます
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line shadow-lift">
                      <Image src={uploadedImage} alt="アップロード画像のプレビュー" fill className="object-cover animate-fade-in" />
                      <button
                        onClick={resetAll}
                        title="写真を削除"
                        className="absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-ink/75 text-paper backdrop-blur-sm transition-all duration-200 hover:bg-ink active:scale-95"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* 02+03+04. オプション */}
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-3">
                    <label className="flex items-baseline gap-2 text-sm sm:text-base font-bold text-ink">
                      <span className="font-display text-sm text-clay">02</span>
                      空間タイプ
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ROOM_TYPES.map((room) => (
                        <button
                          key={room.id}
                          onClick={() => {
                            setSelectedRoom(room.id);
                            setErrorMsg(null);
                          }}
                          className={`cursor-pointer rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                            selectedRoom === room.id
                              ? 'bg-ink text-paper shadow-lift'
                              : 'border border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink'
                          }`}
                        >
                          {room.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-baseline gap-2 text-sm sm:text-base font-bold text-ink">
                        <span className="font-display text-sm text-clay">03</span>
                        リフォームスタイル
                      </label>
                      {selectedStyle && (
                        <button
                          type="button"
                          onClick={() => setSelectedStyle('')}
                          className="text-xs font-semibold text-ink-soft transition-colors hover:text-clay"
                        >
                          選択解除
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                      {STYLES.map((style) => (
                        <button
                          key={style.id}
                          onClick={() => {
                            setSelectedStyle(style.id);
                            setErrorMsg(null);
                          }}
                          className={`flex cursor-pointer flex-col items-start gap-2 rounded-xl border p-2.5 sm:p-3.5 text-left transition-all duration-200 ${
                            selectedStyle === style.id
                              ? 'border-clay bg-clay-soft shadow-lift'
                              : 'border-line bg-paper hover:-translate-y-0.5 hover:border-line-strong'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            {style.swatch.map((color) => (
                              <span
                                key={color}
                                className="h-3 w-3 rounded-full border border-ink/10"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </span>
                          <span className="text-xs font-bold text-ink sm:text-sm">
                            {style.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 04. 使いたい商品・素材の参考画像（任意） */}
                  <div className="flex flex-col gap-4 border-t border-line pt-6">
                    <label className="flex items-baseline gap-2 text-sm sm:text-base font-bold text-ink">
                      <span className="font-display text-sm text-clay">04</span>
                      使いたい商品・素材の参考画像（任意）
                    </label>

                    <div className="grid gap-4 sm:grid-cols-3">
                      {/* ① 床材の参考画像 */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-ink-soft">① 床材の参考画像</span>
                        {!refFlooring ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragOverFlooring(true);
                            }}
                            onDragLeave={() => setIsDragOverFlooring(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDragOverFlooring(false);
                              if (e.dataTransfer.files?.[0]) handleRefImageFile(e.dataTransfer.files[0], 'flooring');
                            }}
                            onClick={() => flooringFileInputRef.current?.click()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                flooringFileInputRef.current?.click();
                              }
                            }}
                            className={`flex aspect-[2.5/1] sm:aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center transition-all duration-300 ${
                              isDragOverFlooring
                                ? 'scale-[0.99] border-clay bg-clay-soft'
                                : 'border-line-strong bg-paper hover:border-ink-faint'
                            }`}
                          >
                            <input
                              ref={flooringFileInputRef}
                              type="file"
                              className="hidden"
                              accept="image/png, image/jpeg, image/webp"
                              onChange={(e) => {
                                if (e.target.files?.[0]) handleRefImageFile(e.target.files[0], 'flooring');
                                e.target.value = '';
                              }}
                            />
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-ink-faint">
                              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span className="text-[10px] text-ink-faint leading-tight">
                              床材テクスチャ等
                            </span>
                          </div>
                        ) : (
                          <div className="relative aspect-[2.5/1] sm:aspect-[4/3] w-full rounded-xl border border-line shadow-sm overflow-hidden group animate-fade-in">
                            <Image src={refFlooring} alt="床材プレビュー" fill className="object-cover animate-fade-in" />
                            <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                onClick={() => setRefFlooring(null)}
                                type="button"
                                className="cursor-pointer rounded-full bg-paper px-3 py-1 text-[10px] font-bold text-ink shadow active:scale-95 transition-all"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ② 壁紙の参考画像 */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-ink-soft">② 壁紙の参考画像</span>
                        {!refWallpaper ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragOverWallpaper(true);
                            }}
                            onDragLeave={() => setIsDragOverWallpaper(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDragOverWallpaper(false);
                              if (e.dataTransfer.files?.[0]) handleRefImageFile(e.dataTransfer.files[0], 'wallpaper');
                            }}
                            onClick={() => wallpaperFileInputRef.current?.click()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                wallpaperFileInputRef.current?.click();
                              }
                            }}
                            className={`flex aspect-[2.5/1] sm:aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center transition-all duration-300 ${
                              isDragOverWallpaper
                                ? 'scale-[0.99] border-clay bg-clay-soft'
                                : 'border-line-strong bg-paper hover:border-ink-faint'
                            }`}
                          >
                            <input
                              ref={wallpaperFileInputRef}
                              type="file"
                              className="hidden"
                              accept="image/png, image/jpeg, image/webp"
                              onChange={(e) => {
                                if (e.target.files?.[0]) handleRefImageFile(e.target.files[0], 'wallpaper');
                                e.target.value = '';
                              }}
                            />
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-ink-faint">
                              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span className="text-[10px] text-ink-faint leading-tight">
                              壁紙テクスチャ等
                            </span>
                          </div>
                        ) : (
                          <div className="relative aspect-[2.5/1] sm:aspect-[4/3] w-full rounded-xl border border-line shadow-sm overflow-hidden group animate-fade-in">
                            <Image src={refWallpaper} alt="壁紙プレビュー" fill className="object-cover animate-fade-in" />
                            <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                onClick={() => setRefWallpaper(null)}
                                type="button"
                                className="cursor-pointer rounded-full bg-paper px-3 py-1 text-[10px] font-bold text-ink shadow active:scale-95 transition-all"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ③ その他・設備の参考画像 */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-ink-soft">③ その他・設備</span>
                        {!refKitchen ? (
                          <div
                            role="button"
                            tabIndex={0}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragOverKitchen(true);
                            }}
                            onDragLeave={() => setIsDragOverKitchen(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDragOverKitchen(false);
                              if (e.dataTransfer.files?.[0]) handleRefImageFile(e.dataTransfer.files[0], 'kitchen');
                            }}
                            onClick={() => kitchenFileInputRef.current?.click()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                kitchenFileInputRef.current?.click();
                              }
                            }}
                            className={`flex aspect-[2.5/1] sm:aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-3 text-center transition-all duration-300 ${
                              isDragOverKitchen
                                ? 'scale-[0.99] border-clay bg-clay-soft'
                                : 'border-line-strong bg-paper hover:border-ink-faint'
                            }`}
                          >
                            <input
                              ref={kitchenFileInputRef}
                              type="file"
                              className="hidden"
                              accept="image/png, image/jpeg, image/webp"
                              onChange={(e) => {
                                if (e.target.files?.[0]) handleRefImageFile(e.target.files[0], 'kitchen');
                                e.target.value = '';
                              }}
                            />
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-ink-faint">
                              <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span className="text-[10px] text-ink-faint leading-tight text-center">
                              設備（バス、トイレ、キッチン、洗面台など）
                            </span>
                          </div>
                        ) : (
                          <div className="relative aspect-[2.5/1] sm:aspect-[4/3] w-full rounded-xl border border-line shadow-sm overflow-hidden group animate-fade-in">
                            <Image src={refKitchen} alt="設備プレビュー" fill className="object-cover animate-fade-in" />
                            <div className="absolute inset-0 bg-ink/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                onClick={() => setRefKitchen(null)}
                                type="button"
                                className="cursor-pointer rounded-full bg-paper px-3 py-1 text-[10px] font-bold text-ink shadow active:scale-95 transition-all"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 에러 + 생성 버튼 (전체 폭) */}
                <div className="flex flex-col gap-5 lg:col-span-2">
                  {errorMsg && (
                    <div
                      role="alert"
                      className="rounded-xl border border-clay/30 bg-clay-soft p-4 text-xs leading-relaxed text-clay-deep"
                    >
                      {errorMsg}
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {/* 残り生成可能枠の表示 */}
                    {!byokMode && (
                      <div className="flex justify-between items-center text-xs font-semibold text-ink-soft bg-paper-raised px-4 py-3 rounded-xl border border-line select-none">
                        <span>会員ステータス:</span>
                        {userPlan === 'pro' ? (
                          <span className="text-clay font-bold animate-pulse">PROプラン（使い放題）</span>
                        ) : userPlan === 'business' ? (
                          <span className="text-clay-deep font-bold animate-pulse">法人プラン（使い放題）</span>
                        ) : userPlan === 'quota' ? (
                          <span className="text-ink font-bold text-ink-strong">追加プラン（残り {freeCount}回）</span>
                        ) : (
                          <span className="text-ink-soft">無料体験（残り {freeCount}回）</span>
                        )}
                      </div>
                    )}

                    <button
                      onClick={handleGenerate}
                      disabled={isLoading || !uploadedImage}
                      className={`w-full rounded-2xl py-4 text-base font-bold transition-all duration-300 ${
                        isLoading || !uploadedImage
                          ? 'cursor-not-allowed bg-sand text-ink-faint'
                          : 'cursor-pointer bg-ink text-paper shadow-lift hover:-translate-y-0.5 hover:bg-clay active:scale-[0.99]'
                      }`}
                    >
                      {isLoading ? '完成予想図を生成中...' : '完成予想図を生成する'}
                    </button>
                  </div>

                  {isLoading && (
                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-paper py-8">
                      <div className="flex items-center gap-2">
                        {[0, 150, 300].map((delay) => (
                          <span
                            key={delay}
                            className="h-2 w-2 animate-bounce rounded-full bg-clay"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </div>
                      <p className="text-sm font-semibold text-ink" aria-live="polite">
                        {LOADING_STATUSES[loadingStep]}
                      </p>
                      <p className="text-xs text-ink-faint">
                        生成には約10秒かかります。そのまましばらくお待ちください。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </div>

      {/* アップグレードモーダル */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm animate-fade-in p-6">
          <div className="w-full max-w-md bg-paper border border-line rounded-3xl p-8 text-center shadow-lift animate-scale-up">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-clay-soft text-clay mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            
            <h3 className="font-display text-xl font-bold text-ink">
              無料体験枠をすべて消費しました
            </h3>
            
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              引き続きリフォーム完成予想図を生成するには、追加生成パックのご購入、または定額使い放題のProプランへのアップグレードをご検討ください。
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <a
                href="#pricing"
                onClick={() => setShowUpgradeModal(false)}
                className="w-full rounded-full bg-ink py-3 text-xs font-bold text-paper shadow-lift hover:bg-clay transition-all block text-center"
              >
                料金プランを見る
              </a>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-full rounded-full border border-line-strong py-3 text-xs font-bold text-ink hover:border-ink transition-all cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
