/**
 * The one audio engine for the app, plus the gesture that is allowed to start it.
 *
 * A browser will not let audio begin without a user gesture, and creating a context early only earns
 * a console warning. So the engine is built lazily, `installAudioUnlock` waits for the first pointer
 * or key press, and anything asked for before that is dropped and counted (see `AudioEngine`).
 */
import { loadAudioSettings } from '../../storage/audioSettings.ts'
import { createAudioEngine, type AudioEngine } from './AudioEngine.ts'

export type { AudioEngine, AudioState, LoopHandle } from './AudioEngine.ts'

let engine: AudioEngine | undefined
let unlockInstalled = false

export function getAudio(): AudioEngine {
  if (engine === undefined) {
    engine = createAudioEngine()
    // The stored preference applies from the first sound, not from the first visit to Options.
    engine.setMuted(loadAudioSettings().muted)
  }

  return engine
}

export function installAudioUnlock(target: Window = window): void {
  if (unlockInstalled) return
  unlockInstalled = true

  const unlock = (): void => {
    getAudio().unlock()
    target.removeEventListener('pointerdown', unlock)
    target.removeEventListener('keydown', unlock)
  }

  target.addEventListener('pointerdown', unlock)
  target.addEventListener('keydown', unlock)
}
