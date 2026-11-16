import { Route, Routes } from 'react-router-dom'
import CourtsPage from './pages/CourtsPage'
import BookPage from './pages/BookPage'
import SignInPage from './pages/SignInPage'
import { AccountPage } from './pages/AccountPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CourtsPage />} />
      <Route path="/book" element={<BookPage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/account" element={<AccountPage />} />
    </Routes>
  )
}
