/**
 * Keyboard input. Listeners are attached only while gameplay is active (brief §1.7 and spec §7:
 * "the game keys may only be captured while the gameplay context is active"), and `preventDefault`
 * is called only for keys the game actually uses, so browsing still works.
 *
 * W/ArrowUp forward · A/ArrowLeft and D/ArrowRight turn · Space front cannon · Q/E broadsides ·
 * P/Escape pause.
 */
import type { ShipIntent } from '../core/intents.ts'
import type { InputState } from './InputState.ts'

export type InputAction = keyof ShipIntent | 'pause'

export type KeyboardInput = {
  attach(): void
  detach(): void
  isAttached(): boolean
}

export type KeyboardInputOptions = {
  readonly state: InputState
  readonly onPause: () => void
  /** Injectable for tests; defaults to the current window. */
  readonly target?: Window
}

const KEY_BINDINGS: Record<string, InputAction> = {
  w: 'forward',
  arrowup: 'forward',
  a: 'rotateLeft',
  arrowleft: 'rotateLeft',
  d: 'rotateRight',
  arrowright: 'rotateRight',
  ' ': 'fireFront',
  q: 'fireLeft',
  e: 'fireRight',
  p: 'pause',
  escape: 'pause',
}

function actionFor(event: KeyboardEvent): InputAction | undefined {
  return KEY_BINDINGS[event.key.toLowerCase()]
}

export function createKeyboardInput(options: KeyboardInputOptions): KeyboardInput {
  const target = options.target ?? window
  let attached = false

  function setIntent(action: InputAction, pressed: boolean): void {
    if (action === 'pause') {
      if (pressed) options.onPause()
      return
    }
    options.state[action] = pressed
  }

  function handleKeyDown(event: KeyboardEvent): void {
    // A listener re-attached by `resume()` can see the very keystroke that caused the resume: pressing
    // Escape in the pause dialog resumed the match and then the freshly attached gameplay listener
    // paused it again, which made the dialog impossible to leave with the keyboard. Anything an
    // upstream handler already consumed (the dialog marks Escape as handled) is not gameplay input.
    if (event.defaultPrevented) return

    const action = actionFor(event)
    if (action === undefined) return

    event.preventDefault()
    if (event.repeat) return

    setIntent(action, true)
  }

  function handleKeyUp(event: KeyboardEvent): void {
    const action = actionFor(event)
    if (action === undefined) return

    event.preventDefault()
    setIntent(action, false)
  }

  /** Losing focus mid-keypress would otherwise leave the ship sailing forever. */
  function handleBlur(): void {
    options.state.clear()
  }

  return {
    attach(): void {
      if (attached) return
      attached = true
      target.addEventListener('keydown', handleKeyDown)
      target.addEventListener('keyup', handleKeyUp)
      target.addEventListener('blur', handleBlur)
    },

    detach(): void {
      if (!attached) return
      attached = false
      target.removeEventListener('keydown', handleKeyDown)
      target.removeEventListener('keyup', handleKeyUp)
      target.removeEventListener('blur', handleBlur)
      options.state.clear()
    },

    isAttached: () => attached,
  }
}
