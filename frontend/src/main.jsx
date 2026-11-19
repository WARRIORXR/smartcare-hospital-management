// src/main.jsx
// -------------
// Entry point of the React app.
// React 18 uses createRoot() instead of old ReactDOM.render()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'   // Import Tailwind CSS
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
