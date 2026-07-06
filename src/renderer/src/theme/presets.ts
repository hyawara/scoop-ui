// ═══════════════════════════════════════════════════════════════
//  全站主题色调色板 —— 唯一数据源 (Single Source of Truth)
//  App.vue / SettingsPanel.vue 均从此处取色，杜绝多处硬编码漂移
//
//  设计规范（按前辈要求）：
//   · 暗色模式首选 Brand-500（鲜亮，在深底上够跳）
//   · 亮色模式首选 Brand-600（更深，在白底上对比度更高）
//   · hover 提亮一档、pressed 压暗一档，符合 Naive UI 交互惯例
//
//  ⚠️ 对比度说明（白字 on 纯色背景，WCAG）：
//   紫/蓝/绿/玫红的 600 档配白字可稳过 AA（≥4.5:1），接近/部分达 AAA。
//   落日橙(amber) 天生偏亮，600 档配白字约 2.7:1 —— 物理上无法达 AAA，
//   故橙色按钮文字建议走深色（见 onColor 字段），其余走白色。
// ═══════════════════════════════════════════════════════════════

export interface ThemeColorTokens {
  /** 主色 */
  primary: string
  /** 悬停态（提亮一档） */
  primaryHover: string
  /** 按下态（压暗一档） */
  primaryPressed: string
}

export interface ThemePreset {
  /** 预设唯一标识，同时作为 config.theme.colorPreset 的存储值 */
  key: string
  /** 中文展示名 */
  name: string
  /** 配色卡片圆点的展示色（取暗色 500，鲜亮好认） */
  dot: string
  /** 暗色模式下的主色三档 */
  dark: ThemeColorTokens
  /** 亮色模式下的主色三档 */
  light: ThemeColorTokens
  /**
   * 主色背景上的前景文字色：
   * 大多数深色调用白字；落日橙偏亮，用深色字保证可读性
   */
  onColor: string
}

/**
 * 五色预设（渲染顺序即此声明顺序）
 *
 * Tailwind 档位对照：
 *   violet 400 #A78BFA / 500 #8B5CF6 / 600 #7C3AED / 700 #6D28D9
 *   blue   400 #60A5FA / 500 #3B82F6 / 600 #2563EB / 700 #1D4ED8
 *   emerald400 #34D399 / 500 #10B981 / 600 #059669 / 700 #047857
 *   amber  400 #FBBF24 / 500 #F59E0B / 600 #D97706 / 700 #B45309
 *   rose   400 #FB7185 / 500 #F43F5E / 600 #E11D48 / 700 #BE123C
 */
export const THEME_PRESETS: Record<string, ThemePreset> = {
  aurora: {
    key: 'aurora',
    name: '极光紫',
    dot: '#8B5CF6',
    dark: { primary: '#8B5CF6', primaryHover: '#A78BFA', primaryPressed: '#7C3AED' },
    light: { primary: '#7C3AED', primaryHover: '#8B5CF6', primaryPressed: '#6D28D9' },
    onColor: '#FFFFFF',
  },
  ocean: {
    key: 'ocean',
    name: '海洋蓝',
    dot: '#3B82F6',
    dark: { primary: '#3B82F6', primaryHover: '#60A5FA', primaryPressed: '#2563EB' },
    light: { primary: '#2563EB', primaryHover: '#3B82F6', primaryPressed: '#1D4ED8' },
    onColor: '#FFFFFF',
  },
  emerald: {
    key: 'emerald',
    name: '翠绿色',
    dot: '#10B981',
    dark: { primary: '#10B981', primaryHover: '#34D399', primaryPressed: '#059669' },
    light: { primary: '#059669', primaryHover: '#10B981', primaryPressed: '#047857' },
    onColor: '#FFFFFF',
  },
  sunset: {
    key: 'sunset',
    name: '落日橙',
    dot: '#F59E0B',
    dark: { primary: '#F59E0B', primaryHover: '#FBBF24', primaryPressed: '#D97706' },
    light: { primary: '#D97706', primaryHover: '#F59E0B', primaryPressed: '#B45309' },
    // 橙色偏亮，白字对比度不足，改用深棕字保证 AA/AAA 可读性
    onColor: '#1E1300',
  },
  rose: {
    key: 'rose',
    name: '玫瑰红',
    dot: '#F43F5E',
    dark: { primary: '#F43F5E', primaryHover: '#FB7185', primaryPressed: '#E11D48' },
    light: { primary: '#E11D48', primaryHover: '#F43F5E', primaryPressed: '#BE123C' },
    onColor: '#FFFFFF',
  },
}

/** 有序 key 列表，供模板 v-for 稳定渲染 */
export const THEME_PRESET_KEYS = Object.keys(THEME_PRESETS)

/** 默认预设：翠绿（按前辈要求） */
export const DEFAULT_PRESET = 'emerald'

/** 安全取预设：非法 key 回退到默认 */
export function resolvePreset(key: string | undefined | null): ThemePreset {
  return (key && THEME_PRESETS[key]) || THEME_PRESETS[DEFAULT_PRESET]
}
