// 공간 유형 · 인테리어 스타일 정의 (클라이언트 UI와 서버 프롬프트가 공유)

export type RoomType = {
  id: string;
  label: string;
  /** Gemini 프롬프트에 들어갈 영문 명칭 */
  prompt: string;
};

export type StyleOption = {
  id: string;
  label: string;
  desc: string;
  /** 스타일 카드에 표시되는 대표 색상 스와치 */
  swatch: [string, string, string];
  /** Gemini 프롬프트에 들어갈 스타일 지시문 */
  prompt: string;
};

export const ROOM_TYPES: RoomType[] = [
  { id: "living_room", label: "リビング", prompt: "living room" },
  { id: "bedroom", label: "寝室", prompt: "bedroom" },
  { id: "kitchen", label: "キッチン", prompt: "kitchen" },
  { id: "bathroom", label: "浴室・バスルーム", prompt: "bathroom" },
  { id: "study", label: "書斎・ホームオフィス", prompt: "home office / study room" },
  { id: "studio", label: "ワンルーム", prompt: "studio apartment" },
];

export const STYLES: StyleOption[] = [
  {
    id: "wa_modern",
    label: "和モダン",
    desc: "和室から洋風への改修・畳とフローリングの融合",
    swatch: ["#eae3d2", "#8c7b60", "#3d3a33"],
    prompt:
      "Japanese modern style: fusion of traditional Japanese aesthetics and modern design. Light tatami mats or modern wood flooring, low-profile wooden furniture, shoji or wood slats, washi paper pendant lights, natural earthy tones mixed with contemporary elements",
  },
  {
    id: "scandinavian_natural",
    label: "北欧ナチュラル",
    desc: "明るい木目と白を基調とした温かみのある空間",
    swatch: ["#f4f2ee", "#b9a284", "#5f6f5e"],
    prompt:
      "Scandinavian natural style: bright light oak wood finishes, white and cream walls, cozy wool and linen textiles, minimalist and functional wooden furniture, warm lighting, touches of soft green or neutral colors",
  },
  {
    id: "luxury_modern",
    label: "ラグジュアリーモダン",
    desc: "高級感のあるホテルライクな暮らし",
    swatch: ["#1f2430", "#9c8455", "#e5e5e5"],
    prompt:
      "luxury hotel-like modern style: premium marble walls or floors, brass and gold metallic accents, plush fabrics, sophisticated ambient lighting, dark neutral colors, sleek high-end contemporary furniture",
  },
  {
    id: "simple_accent",
    label: "シンプルアクセント",
    desc: "壁紙1面変更・クロス張替えによる部分リフォーム",
    swatch: ["#4b6584", "#d1d8e0", "#ffffff"],
    prompt:
      "simple accent wall style: one accent wallpaper wall (such as muted slate blue, sage green, or charcoal gray) with remaining walls in clean matte white, matching modern minimalist furniture and flooring, clean and fresh look",
  },
  {
    id: "industrial",
    label: "インダストリアル",
    desc: "カフェ風・ヴィンテージ感のあるおしゃれな内装",
    swatch: ["#4a4a4a", "#7d6a58", "#2f3540"],
    prompt:
      "industrial cafe vintage style: exposed dark concrete or brick textures, black steel or iron frames, rustic reclaimed dark wood furniture, vintage Edison bulb light fixtures, brown leather seating",
  },
];

export const FREE_GENERATIONS = 5;
export const DAILY_IP_LIMIT = 5;
