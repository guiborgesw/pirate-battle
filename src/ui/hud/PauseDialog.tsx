import { useEffect, useRef } from 'react'

import type { PauseReason } from '../../game/GameSession.ts'
import styles from './PauseDialog.module.css'

export type PauseDialogProps = {
  readonly reason: PauseReason | undefined
  readonly onResume: () => void
}

const REASON_TEXT: Record<PauseReason, string> = {
  user: 'You paused the match.',
  blur: 'The window lost focus, so the match paused automatically.',
  hidden: 'The tab was hidden, so the match paused automatically.',
  auto: 'The match paused automatically.',
}

/**
 * Pause dialog (plan §1.6, spec §2/§7).
 *
 * The match only resumes from an explicit action here: focus is moved into the dialog, Tab stays
 * inside it, and Escape resumes. That is why the session detaches its gameplay key listeners while
 * paused — a paused match cannot be driven by the keys that are still being held down.
 */
export function PauseDialog({ reason, onResume }: PauseDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = dialogRef.current

    const focusables = (): HTMLElement[] =>
      Array.from(
        (node ?? document).querySelectorAll<HTMLElement>(
          '[role="dialog"] button, [role="dialog"] [href], [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea',
        ),
      )

    // Focus moves into the dialog, so a keyboard player resumes with the button they can see.
    focusables()[0]?.focus()

    /**
     * Escape and the Tab trap are handled on the document rather than on the dialog node: focus can
     * sit on the dialog or on the body depending on how the pause was triggered, and a listener tied
     * to one node stops seeing the key the moment focus leaves it. While paused the session has
     * already detached its gameplay keys, so nothing here competes with gameplay input.
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // Consume the keystroke: `resume()` re-attaches the gameplay keys, and without this the same
        // Escape would keep travelling up to that fresh listener and pause the match again.
        event.preventDefault()
        event.stopPropagation()
        onResume()
        return
      }

      if (event.key !== 'Tab') return

      const items = focusables()
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onResume])

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        data-testid="pause-dialog"
        ref={dialogRef}
      >
        <h2 className={styles.title} id="pause-title">
          Paused
        </h2>
        <p className={styles.reason}>{REASON_TEXT[reason ?? 'user']}</p>
        <p className={styles.hint}>
          The timer, the guns and every ship are frozen until you resume.
        </p>
        <button className={styles.resume} data-testid="resume" type="button" onClick={onResume}>
          Resume
        </button>
      </div>
    </div>
  )
}
