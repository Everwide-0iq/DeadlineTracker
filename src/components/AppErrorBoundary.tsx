import { Component, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  error: Error | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="grid min-h-screen place-items-center bg-[var(--background)] p-5 text-white">
        <section className="mission-state-card max-w-xl rounded-[28px] border border-red-300/25 bg-red-500/10 p-6 text-center shadow-2xl backdrop-blur-xl">
          <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-red-200/80">
            Fireboard
          </p>
          <h1 className="mb-3 text-2xl font-black">Что-то сломалось</h1>
          <p className="mb-5 text-sm leading-6 text-red-100/75">
            Интерфейс поймал неожиданную ошибку. Перезагрузка обычно возвращает доску в рабочее
            состояние.
          </p>
          <button className="primary-button mx-auto" type="button" onClick={() => window.location.reload()}>
            Перезагрузить
          </button>
        </section>
      </main>
    )
  }
}
