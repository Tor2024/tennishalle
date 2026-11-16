import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import CourtsPage from './pages/CourtsPage'
import BookPage from './pages/BookPage'
import SignInPage from './pages/SignInPage'
import { AccountPage } from './pages/AccountPage'
import { AdminPage } from './pages/AdminPage'
import { LegalPageView } from './pages/LegalPage'
import { CookieBanner } from './components/CookieBanner'
import { apiData } from './lib/api'

export default function App() {
  const location = useLocation()

  // page views tracking (admin statistics)
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return
    apiData('track', { path: location.pathname }).catch(() => {})
  }, [location.pathname])

  return (
    <>
      <Routes>
        <Route path="/" element={<CourtsPage />} />
        <Route path="/book" element={<BookPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/legal/:page" element={<LegalPageView />} />
      </Routes>
      <CookieBanner />
    </>
  )
}
