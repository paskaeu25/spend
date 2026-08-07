import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { init } from './store/store'
import './styles/base.css'

// Kick the data read off before React mounts, so the first paint already has data
// on anything but a cold cache.
void init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
