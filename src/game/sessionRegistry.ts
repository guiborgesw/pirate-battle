/**
 * The currently mounted session, so the test hooks can reach it without prop drilling.
 * React registers the session on mount and clears it on unmount.
 */
import type { GameSession } from './GameSession.ts'

let current: GameSession | undefined

export function setCurrentSession(session: GameSession | undefined): void {
  current = session
}

export function getCurrentSession(): GameSession | undefined {
  return current
}
