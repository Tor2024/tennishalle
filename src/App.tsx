import { Route, Routes } from 'react-router-dom'
import CourtsPage from './pages/CourtsPage'
import BookPage from './pages/BookPage'
import SignInPage from './pages/SignInPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CourtsPage />} />
      <Route path="/book" element={<BookPage />} />
      <Route path="/sign-in" element={<SignInPage />} />
    </Routes>
  )
}
