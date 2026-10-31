import type { Profile } from '../lib/types'
import { avatarColor, initials } from '../lib/util'

export function Avatar({ p, size = 9 }: { p?: Profile; size?: number }) {
  const name = p?.full_name ?? '?'
  return (
    <div className={`${avatarColor(p?.id ?? '?')} flex shrink-0 items-center justify-center rounded-md font-semibold text-white`}
      style={{ width: size * 4, height: size * 4, fontSize: size * 1.5 }} title={name}>
      {initials(name)}
    </div>
  )
}
