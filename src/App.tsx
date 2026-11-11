import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import CourtsPage from './pages/CourtsPage'
import BookPage from './pages/BookPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/courts" element={<CourtsPage />} />
      <Route path="/book" element={<BookPage />} />
    </Routes>
  )
}
