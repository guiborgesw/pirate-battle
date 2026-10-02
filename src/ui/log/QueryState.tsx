import type { ReactNode } from 'react'

import styles from './QueryStates.module.css'

export type QueryStateProps = {
  readonly isLoading: boolean
  readonly isFetching: boolean
  readonly error: Error | null
  readonly isEmpty: boolean
  readonly emptyText: string
  readonly onRetry: () => void
  readonly children: ReactNode
}

/**
 * The four states every remote list has to handle (spec §5): loading, empty, error with a retry, and a
 * background refresh. The refresh line only appears when there is already something on screen, so it
 * reads as "this is being updated" rather than as a second loading state.
 */
export function QueryState({
  isLoading,
  isFetching,
  error,
  isEmpty,
  emptyText,
  onRetry,
  children,
}: QueryStateProps): ReactNode {
  if (error !== null) {
    return (
      <div className={styles.state} data-testid="query-error">
        <p className={styles.message} role="alert">
          {error.message || 'The request failed.'}
        </p>
        <button className={styles.retry} type="button" data-testid="query-retry" onClick={onRetry}>
          Try again
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <p className={styles.state} data-testid="query-loading" role="status">
        Loading…
      </p>
    )
  }

  if (isEmpty) {
    return (
      <p className={styles.state} data-testid="query-empty">
        {emptyText}
      </p>
    )
  }

  return (
    <div className={styles.content}>
      {isFetching && (
        <p className={styles.updating} data-testid="query-updating" role="status">
          Updating…
        </p>
      )}
      {children}
    </div>
  )
}
