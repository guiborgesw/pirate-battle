/**
 * The small UI kit every menu screen is built from: the wooden panel and the button styles that come
 * with the UI atlas (`panel_menu`, `button_primary_*`, `button_secondary_*`, `button_round_*` plus the
 * control icons). Sizes come from the measured sprites, so the screens look like the challenge
 * mockups instead of like generic web buttons.
 */
import type { ReactNode } from 'react'

import styles from './GamePanel.module.css'

export type GamePanelProps = {
  /** Id of the heading that names this screen, so the panel is announced correctly. */
  readonly titleId?: string
  readonly children: ReactNode
}

export function GamePanel({ titleId, children }: GamePanelProps) {
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      {children}
    </section>
  )
}

/** The painted "PIRATE BATTLE" banner that ships in the UI atlas. */
export function TitleBanner({ label }: { readonly label: string }) {
  return (
    <img
      className={styles.banner}
      src="/assets/png/ui/menu/title_pirate_battle.png"
      alt={label}
      width={384}
      height={128}
    />
  )
}

export function ScreenTitle({
  id,
  children,
}: {
  readonly id: string
  readonly children: ReactNode
}) {
  return (
    <h1 className={styles.screenTitle} id={id}>
      {children}
    </h1>
  )
}

export type ButtonProps = {
  readonly children: ReactNode
  readonly nowrap?: boolean
  readonly testId?: string
  readonly ariaDescribedBy?: string
  readonly ariaPressed?: boolean
  readonly onClick?: () => void
}

export function PrimaryButton({
  children,
  testId,
  ariaDescribedBy,
  ariaPressed,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={styles.primary}
      type="button"
      data-testid={testId}
      aria-describedby={ariaDescribedBy}
      aria-pressed={ariaPressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({
  children,
  testId,
  ariaDescribedBy,
  ariaPressed,
  onClick,
}: ButtonProps) {
  return (
    <button
      className={styles.secondary}
      type="button"
      data-testid={testId}
      aria-describedby={ariaDescribedBy}
      aria-pressed={ariaPressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Round gold button from the atlas, with a control icon drawn on top. */
export function RoundButton({
  icon,
  label,
  testId,
  disabled = false,
  onClick,
}: {
  readonly icon: string
  readonly label: string
  readonly testId?: string
  readonly disabled?: boolean
  readonly onClick?: () => void
}) {
  return (
    <button
      className={styles.round}
      type="button"
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      <img
        className={styles.roundIcon}
        src={`/assets/png/ui/controls/${icon}.png`}
        alt=""
        width={48}
        height={48}
      />
    </button>
  )
}

export function SoonBadge() {
  return <span className={styles.soon}>Soon</span>
}

/** Kept for screens that still label a placeholder; the log's tabs no longer need it (M11). */
