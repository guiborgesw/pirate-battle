import styles from './App.module.css'

/**
 * M1 placeholder screen. The real screen router (menu / options / log / game / result)
 * arrives in M9; it replaces this component.
 */
export default function App() {
  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="placeholder-title">
        <h1 className={styles.title} id="placeholder-title">
          Pirate Battle
        </h1>
        <p className={styles.subtitle}>
          M1 scaffold: strict TypeScript, PixiJS 8, React 18, MSW-ready.
        </p>
        <button className={styles.primary} type="button" disabled>
          Play
        </button>
        <p className={styles.note}>
          Gameplay arrives with M4–M8. Panels and buttons are drawn with the challenge UI sprites.
        </p>
      </section>
    </main>
  )
}
