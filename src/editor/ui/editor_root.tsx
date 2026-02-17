import type { Component } from 'solid-js'

export const EditorRoot: Component = () => {
  return (
    <main style={{ padding: '2rem', 'max-width': '920px', margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 0.5rem', 'font-size': '2rem' }}>
        Tritonizer Editor
      </h1>
      <p style={{ margin: 0, color: '#465462' }}>
        Rebuild in progress. Core editor modules are being wired.
      </p>
    </main>
  )
}
