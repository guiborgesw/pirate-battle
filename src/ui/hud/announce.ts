/**
 * What the HUD says out loud (plan M13, spec §7: "make score, time and match state available in a
 * semantic interface too; avoid announcing every frame").
 *
 * The trick is that the announcement is a *function of the snapshot* that is constant over each stretch
 * of time it cares about: the time is bucketed, so the text only changes when a bucket is crossed, and
 * a live region only speaks when its text changes. No timers, no effects, nothing to unsubscribe — and
 * no way to announce every second by accident.
 */
/** How often the clock is spoken: every thirty seconds, and once more with ten seconds to go. */
export const TIME_ANNOUNCE_BUCKET_SEC = 30
export const TIME_ANNOUNCE_FINAL_SEC = 10

export type AnnounceInput = {
  readonly score: number
  readonly remainingSec: number
  readonly paused: boolean
}

/** Which thirty-second stretch of the clock this is. Changes once per bucket, never within one. */
export function timeBucket(remainingSec: number): number {
  return Math.floor(Math.max(0, remainingSec) / TIME_ANNOUNCE_BUCKET_SEC)
}

/** Time in words, stable inside each bucket and once more at the ten-second mark. */
export function timeAnnouncement(remainingSec: number): string {
  if (remainingSec <= TIME_ANNOUNCE_FINAL_SEC) return 'Ten seconds left'

  const bucket = timeBucket(remainingSec)
  const seconds = bucket * TIME_ANNOUNCE_BUCKET_SEC
  return seconds >= 60 && seconds % 60 === 0
    ? `${seconds / 60} minutes left`
    : `${seconds} seconds left`
}

export function announcementFor({ score, remainingSec, paused }: AnnounceInput): string {
  const scorePart = score === 1 ? '1 point' : `${score} points`
  const timePart = timeAnnouncement(remainingSec)
  return paused ? `Match paused. ${scorePart}. ${timePart}` : `${scorePart}. ${timePart}`
}
