import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'

import type { InputState } from '../../game/input/InputState.ts'
import {
  TOUCH_FIRE_BUTTONS,
  clampToRadius,
  createTouchWriter,
  offsetFrom,
  stickIntentFor,
  type Offset,
} from '../../game/input/touchIntent.ts'
import styles from './TouchInput.module.css'

export type TouchInputProps = {
  readonly state: InputState
}

/**
 * The touch controls (spec §7): a stick for the left thumb and three guns for the right.
 *
 * Multi-touch is the point, not a bonus — steering and firing at the same time needs two fingers, so the
 * stick remembers the pointer that owns it and the buttons each handle their own. Everything writes into
 * the same `InputState` the keyboard writes into, so the match rules never learn which device is playing.
 */
export function TouchInput({ state }: TouchInputProps): ReactNode {
  const baseRef = useRef<HTMLDivElement>(null)
  const stickPointer = useRef<number | undefined>(undefined)
  const [nub, setNub] = useState<Offset>({ x: 0, y: 0 })
  const writer = useMemo(() => createTouchWriter(state), [state])

  const applyStick = useCallback(
    (offset: Offset, radius: number) => {
      writer.setStick(stickIntentFor(offset, radius))
      setNub(clampToRadius(offset, radius))
    },
    [writer],
  )

  const releaseStick = useCallback(() => {
    stickPointer.current = undefined
    writer.release()
    setNub({ x: 0, y: 0 })
  }, [writer])

  // Leaving the arena with a finger down would otherwise sail on forever.
  useEffect(() => releaseStick, [releaseStick])

  const handleStickDown = (event: PointerEvent<HTMLDivElement>): void => {
    const base = baseRef.current
    // A second finger on the stick is ignored: the first one owns it until it lifts.
    if (base === null || stickPointer.current !== undefined) return

    stickPointer.current = event.pointerId
    base.setPointerCapture(event.pointerId)

    const rect = base.getBoundingClientRect()
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    applyStick(offsetFrom(centre, { x: event.clientX, y: event.clientY }), rect.width / 2)
  }

  const handleStickMove = (event: PointerEvent<HTMLDivElement>): void => {
    const base = baseRef.current
    if (base === null || stickPointer.current !== event.pointerId) return

    const rect = base.getBoundingClientRect()
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    applyStick(offsetFrom(centre, { x: event.clientX, y: event.clientY }), rect.width / 2)
  }

  const handleStickUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (stickPointer.current !== event.pointerId) return
    releaseStick()
  }

  return (
    <div className={styles.controls} data-testid="touch-controls">
      <div
        className={styles.stick}
        ref={baseRef}
        data-testid="touch-stick"
        aria-hidden="true"
        onPointerDown={handleStickDown}
        onPointerMove={handleStickMove}
        onPointerUp={handleStickUp}
        onPointerCancel={handleStickUp}
      >
        <div className={styles.nub} style={{ transform: `translate(${nub.x}px, ${nub.y}px)` }} />
      </div>

      <div className={styles.guns}>
        {TOUCH_FIRE_BUTTONS.map(({ intent, icon, label }) => (
          <button
            className={styles.gun}
            type="button"
            key={intent}
            aria-label={label}
            data-testid={`touch-${intent}`}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              writer.setFire(intent, true)
            }}
            onPointerUp={() => {
              writer.setFire(intent, false)
            }}
            onPointerCancel={() => {
              writer.setFire(intent, false)
            }}
            onLostPointerCapture={() => {
              writer.setFire(intent, false)
            }}
          >
            <img src={`/assets/png/ui/controls/${icon}.png`} alt="" width={48} height={48} />
          </button>
        ))}
      </div>
    </div>
  )
}
