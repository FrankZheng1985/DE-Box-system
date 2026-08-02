interface BrandMarkProps {
  /** 尺寸类名，默认 w-5 h-5 */
  className?: string
  /** 左侧竖条颜色。深色底传白色，浅色底传石墨黑 */
  barColor?: string
}

/**
 * KALUNA SPED 品牌图标 —— 石墨黑竖条 + 朱砂红 K
 * 完整 Logo 套件见 brand/kaluna-sped/
 */
export default function BrandMark({ className = 'w-5 h-5', barColor = '#FFFFFF' }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label="KALUNA SPED">
      <rect x="7" y="9" width="7" height="30" fill={barColor} />
      <path d="M18 24 L32 10 L42 10 L28 24 L42 38 L32 38 Z" fill="#E5432E" />
    </svg>
  )
}
