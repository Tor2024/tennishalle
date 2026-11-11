import { Navigate } from 'react-router-dom'

export default function HomePage() {
  // The original site redirects / to /courts; production behaves the same.
  return <Navigate to="/courts" replace />
}
