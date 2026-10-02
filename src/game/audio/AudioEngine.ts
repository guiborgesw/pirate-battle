/**
 * The audio device for the whole app.
 *
 * Design notes that matter for the acceptance ("no audio errors when the tab lacks user gesture"):
 * - the `AudioContext` is **not** created until the first user gesture. Before that every request is
 *   counted as `droppedWhileLocked` and silently dropped, so a browser that refuses to start audio
 *   never sees an exception and never hears a console warning;
 * - sounds that arrive while the context exists but is still suspended are dropped the same way, so
 *   the engine has exactly one rule for "not ready": count it and move on.
 *
 * Buffers come from the asset loader already fetched as raw `ArrayBuffer`s (`loadAssets`), so this
 * module only decodes them — it never goes back to the network.
 */
import type { SoundKey } from '../assets/manifest.ts'

export type AudioState = {
  readonly available: boolean
  readonly unlocked: boolean
  readonly muted: boolean
  readonly plays: Readonly<Record<string, number>>
  /** Sound requests that arrived with no running context — the gesture-less tab case. */
  readonly droppedWhileLocked: number
  /** Requests that arrived before their buffer finished decoding; should stay zero in practice. */
  readonly droppedWithoutBuffer: number
  readonly loops: readonly string[]
}

export type LoopHandle = {
  readonly setGain: (gain: number) => void
  readonly stop: () => void
}

export type AudioEngine = {
  /** Called from the first user gesture (pointer down or key down). Safe to call repeatedly. */
  readonly unlock: () => void
  readonly setMuted: (muted: boolean) => void
  /** Resolves once every buffer has been decoded, so a caller can wait before playing anything. */
  readonly setBuffers: (buffers: Partial<Record<SoundKey, ArrayBuffer>>) => Promise<void>
  readonly play: (key: SoundKey, gain?: number) => void
  readonly startLoop: (key: SoundKey, gain?: number) => LoopHandle
  readonly getState: () => AudioState
  readonly destroy: () => void
}

/**
 * The same sound fired twice inside this window is one event, not two: a broadside is a volley of
 * three shots leaving in the same step, and stacking three cannon blasts is noise, not feedback.
 */
const MIN_INTERVAL_MS = 45
const FADE_SEC = 0.12

export function createAudioEngine(): AudioEngine {
  let context: AudioContext | undefined
  let master: GainNode | undefined
  let raw: Partial<Record<SoundKey, ArrayBuffer>> = {}
  let muted = false
  let droppedWhileLocked = 0
  let droppedWithoutBuffer = 0

  const decoded = new Map<SoundKey, AudioBuffer>()
  const lastPlayedAt = new Map<SoundKey, number>()
  const plays: Record<string, number> = {}
  const playing = new Set<AudioBufferSourceNode>()
  const activeLoops = new Set<string>()

  function audioContextCtor(): typeof AudioContext | undefined {
    if (typeof window === 'undefined') return undefined
    const scope = window as unknown as {
      AudioContext?: typeof AudioContext
      webkitAudioContext?: typeof AudioContext
    }
    return scope.AudioContext ?? scope.webkitAudioContext
  }

  function ensureContext(): AudioContext | undefined {
    if (context !== undefined) return context

    const Ctor = audioContextCtor()
    if (Ctor === undefined) return undefined

    try {
      const created = new Ctor()
      const gain = created.createGain()
      gain.gain.value = muted ? 0 : 1
      gain.connect(created.destination)
      context = created
      master = gain
      void decodeAll(created)
    } catch {
      // A browser that refuses to build a context is simply "no audio", not a crash.
      context = undefined
    }

    return context
  }

  async function decodeAll(active: AudioContext): Promise<void> {
    const pending: Promise<void>[] = []

    for (const [key, buffer] of Object.entries(raw) as [SoundKey, ArrayBuffer][]) {
      if (decoded.has(key)) continue
      // `decodeAudioData` detaches the buffer it is given, so hand it a copy and keep ours intact.
      pending.push(
        active
          .decodeAudioData(buffer.slice(0))
          .then((audio) => {
            decoded.set(key, audio)
          })
          .catch(() => undefined),
      )
    }

    await Promise.all(pending)
  }

  function unlock(): void {
    const active = ensureContext()
    if (active === undefined) return
    if (active.state === 'suspended') void active.resume().catch(() => undefined)
  }

  function play(key: SoundKey, gain = 1): void {
    if (context?.state !== 'running') {
      droppedWhileLocked += 1
      return
    }

    const active = context
    const buffer = decoded.get(key)
    if (buffer === undefined) {
      // The buffer is still decoding. Counting it keeps `getState()` honest instead of silent.
      droppedWithoutBuffer += 1
      return
    }

    const now = active.currentTime * 1000
    const previous = lastPlayedAt.get(key)
    if (previous !== undefined && now - previous < MIN_INTERVAL_MS) return
    lastPlayedAt.set(key, now)

    const source = active.createBufferSource()
    source.buffer = buffer

    const node = active.createGain()
    node.gain.value = gain
    source.connect(node).connect(master ?? active.destination)
    source.start()

    source.onended = () => {
      playing.delete(source)
      node.disconnect()
    }

    playing.add(source)
    plays[key] = (plays[key] ?? 0) + 1
  }

  function startLoop(key: SoundKey, gain = 0.3): LoopHandle {
    const silent: LoopHandle = { setGain: () => undefined, stop: () => undefined }
    if (context?.state !== 'running') {
      droppedWhileLocked += 1
      return silent
    }

    const active = context
    const buffer = decoded.get(key)
    if (buffer === undefined) return silent

    const source = active.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const node = active.createGain()
    node.gain.setValueAtTime(0, active.currentTime)
    node.gain.linearRampToValueAtTime(gain, active.currentTime + FADE_SEC)
    source.connect(node).connect(master ?? active.destination)
    source.start()

    activeLoops.add(key)
    let stopped = false

    return {
      setGain: (next: number) => {
        if (stopped) return
        node.gain.cancelScheduledValues(active.currentTime)
        node.gain.setValueAtTime(node.gain.value, active.currentTime)
        node.gain.linearRampToValueAtTime(next, active.currentTime + FADE_SEC)
      },
      stop: () => {
        if (stopped) return
        stopped = true
        node.gain.cancelScheduledValues(active.currentTime)
        node.gain.setValueAtTime(node.gain.value, active.currentTime)
        node.gain.linearRampToValueAtTime(0, active.currentTime + FADE_SEC)
        source.stop(active.currentTime + FADE_SEC + 0.02)
        source.onended = () => {
          node.disconnect()
          activeLoops.delete(key)
        }
      },
    }
  }

  return {
    unlock,
    setMuted: (next: boolean) => {
      muted = next
      if (master !== undefined) master.gain.value = next ? 0 : 1
    },
    setBuffers: async (buffers: Partial<Record<SoundKey, ArrayBuffer>>) => {
      raw = buffers
      if (context !== undefined) await decodeAll(context)
    },
    play,
    startLoop,
    getState: () => ({
      available: audioContextCtor() !== undefined,
      unlocked: context?.state === 'running',
      muted,
      plays: { ...plays },
      droppedWhileLocked,
      droppedWithoutBuffer,
      loops: [...activeLoops],
    }),
    destroy: () => {
      for (const source of playing) {
        try {
          source.stop()
        } catch {
          // Already stopped; nothing to do.
        }
      }
      playing.clear()
      activeLoops.clear()
      void context?.close().catch(() => undefined)
      context = undefined
      master = undefined
      decoded.clear()
    },
  }
}
