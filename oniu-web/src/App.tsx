import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from '@/pages/HomePage'
import ServicesPage from '@/pages/ServicesPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
