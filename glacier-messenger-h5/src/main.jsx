import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const root = createRoot(document.getElementById('root'))
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// React 就绪后撤掉首屏占位（避免白屏）
requestAnimationFrame(() => {
  const boot = document.getElementById('boot')
  if (!boot) return
  boot.style.opacity = '0'
  setTimeout(() => boot.remove(), 500)
})
