/**
 * Line icons drawn as inline SVG. They replace Unicode symbols (⌖ ✦ ◷ ⚙ ⌕ ↗) that rendered as empty boxes
 * on systems whose fonts lack those glyphs. Icons are decorative: the button around them carries the label.
 */
const PATHS = {
  map: 'M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20zM8.5 4v13.5M15.5 6.5V20',
  place: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  journal: 'M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7.5A2.5 2.5 0 0 1 5 17zM5 17a2.5 2.5 0 0 1 2.5-2.5H19M9 8.5h6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1-2 3.4-1.8-.7a7.6 7.6 0 0 1-2.2 1.3L14.7 21h-4l-.3-2.5a7.6 7.6 0 0 1-2.2-1.3l-1.8.7-2-3.4 1.6-1a7.8 7.8 0 0 1 0-3l-1.6-1 2-3.4 1.8.7a7.6 7.6 0 0 1 2.2-1.3L10.7 3h4l.3 2.5a7.6 7.6 0 0 1 2.2 1.3l1.8-.7 2 3.4-1.6 1a7.8 7.8 0 0 1 0 3z',
  brand: 'M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3-7.3-2.2 7.3-2.2z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8',
  send: 'M5 12h13M12.5 6l6 6-6 6',
  stop: 'M7 7h10v10H7z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={`icon ${className ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}
