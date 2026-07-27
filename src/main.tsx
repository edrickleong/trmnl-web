import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ShapeProvider } from '@/lib/shape-context'
import { applyTheme, getTheme } from '@/lib/theme'

// Apply the stored theme before first paint so there's no light/dark flash
applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShapeProvider defaultShape="rounded">
      <App />
    </ShapeProvider>
  </StrictMode>,
)
