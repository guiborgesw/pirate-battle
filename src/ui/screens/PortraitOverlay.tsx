import type { ReactNode } from 'react'

import styles from './PortraitOverlay.module.css'

/**
 * The supported mobile orientation is landscape (brief §1.7), so a portrait phone gets this instead of a
 * letterboxed arena it cannot play. The match is paused while it is up, which is what keeps the clock
 * from running down behind the message.
 */
export function PortraitOverlay(): ReactNode {
  return (
    <div
      className={styles.overlay}
      role="alertdialog"
      aria-label="Rotate your device"
      data-testid="portrait-overlay"
    >
      <div className={styles.card}>
        <img
          className={styles.icon}
          src="/assets/png/ui/controls/icon_turn_right.png"
          alt=""
          width={64}
          height={64}
        />
        <p className={styles.title}>Rotate your device</p>
        <p className={styles.body}>
          Pirate Battle is played in landscape. Turn your phone sideways to sail.
        </p>
      </div>
    </div>
  )
}
