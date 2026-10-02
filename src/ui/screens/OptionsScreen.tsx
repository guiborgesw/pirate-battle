import { useState } from 'react'

import {
  formatOptionValue,
  OPTION_BOUNDS,
  parseStoredOptions,
  stepOptionValue,
  type GameOptions,
  type OptionKey,
} from '../../config/optionsSchema.ts'
import { readJson } from '../../storage/localStore.ts'
import { loadOptions, saveOptions } from '../../storage/settings.ts'
import { GamePanel, PrimaryButton, RoundButton, ScreenTitle } from '../components/GamePanel.tsx'
import styles from './OptionsScreen.module.css'

export type OptionsScreenProps = {
  readonly onBack: () => void
}

const FIELDS: readonly {
  readonly key: OptionKey
  readonly label: string
  readonly hint: string
}[] = [
  {
    key: 'durationSec',
    label: 'Game session time',
    hint: `Whole seconds, ${OPTION_BOUNDS.durationSec.min}–${OPTION_BOUNDS.durationSec.max}.`,
  },
  {
    key: 'spawnIntervalMs',
    label: 'Enemy spawn time',
    hint: `Steps of ${OPTION_BOUNDS.spawnIntervalMs.step / 1000} s, ${OPTION_BOUNDS.spawnIntervalMs.min / 1000}–${OPTION_BOUNDS.spawnIntervalMs.max / 1000} s.`,
  },
]

/**
 * Options screen (spec §3): game session time and enemy spawn time, validated, saved and persisted.
 *
 * The steppers are the primary control, as in `sample_options.png`: stepping can only ever produce a
 * value inside the documented bounds, and hitting a bound is announced rather than silently ignored.
 * The one way invalid data could reach this screen is a corrupt or hand-edited store, so that case is
 * reported out loud instead of being swallowed by the defaults.
 */
export function OptionsScreen({ onBack }: OptionsScreenProps) {
  const [options, setOptions] = useState<GameOptions>(() => loadOptions())
  const [status, setStatus] = useState('')
  const [warning] = useState<string | undefined>(() => {
    const stored = readJson('options')
    if (!stored.found) {
      return stored.reason === 'corrupt'
        ? 'Saved options were unreadable, so the defaults have been loaded.'
        : undefined
    }

    return parseStoredOptions(stored.value) === undefined
      ? 'Saved options were out of range, so the defaults have been loaded.'
      : undefined
  })

  const change = (key: OptionKey, direction: 1 | -1): void => {
    const field = FIELDS.find((entry) => entry.key === key)
    const label = field?.label ?? key

    const previous = options[key]
    const next = stepOptionValue(key, previous, direction)

    if (next === previous) {
      setStatus(
        `${label} is already at its ${direction === -1 ? 'lowest' : 'highest'} value (${formatOptionValue(key, next)}).`,
      )
      return
    }

    const updated: GameOptions = { ...options, [key]: next }
    setOptions(updated)
    setStatus(
      saveOptions(updated)
        ? `Saved ${label}: ${formatOptionValue(key, next)}.`
        : `This browser refused to save ${label}; the value applies to this session only.`,
    )
  }

  return (
    <GamePanel titleId="options-title">
      <ScreenTitle id="options-title">Options</ScreenTitle>

      {warning !== undefined && (
        <p className={styles.warning} role="alert" data-testid="options-warning">
          {warning}
        </p>
      )}

      {FIELDS.map((field) => (
        <div className={styles.field} key={field.key}>
          <span className={styles.label} id={`label-${field.key}`}>
            {field.label}
          </span>
          <div className={styles.stepper} role="group" aria-labelledby={`label-${field.key}`}>
            <RoundButton
              icon="icon_minus"
              label={`Decrease ${field.label.toLowerCase()}`}
              testId={`option-${field.key}-minus`}
              onClick={() => {
                change(field.key, -1)
              }}
            />
            <output className={styles.value} data-testid={`option-${field.key}`}>
              {formatOptionValue(field.key, options[field.key])}
            </output>
            <RoundButton
              icon="icon_plus"
              label={`Increase ${field.label.toLowerCase()}`}
              testId={`option-${field.key}-plus`}
              onClick={() => {
                change(field.key, 1)
              }}
            />
          </div>
          <span className={styles.hint}>{field.hint}</span>
        </div>
      ))}

      <p className={styles.status} role="status" aria-live="polite" data-testid="options-status">
        {status}
      </p>

      <p className={styles.note}>Each match uses the options in force when it starts.</p>

      <PrimaryButton testId="options-back" onClick={onBack}>
        Main menu
      </PrimaryButton>
    </GamePanel>
  )
}
