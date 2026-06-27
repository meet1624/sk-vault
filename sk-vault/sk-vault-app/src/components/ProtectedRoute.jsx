import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Wrap any page that should only be visible to logged-in users.
// Usage: <ProtectedRoute><LibraryPage /></ProtectedRoute>
// adminOnly: requires the true 'admin' role (e.g. user management)
// requireBookManager: requires 'admin' OR 'editor' (book management)
export function ProtectedRoute({ children, adminOnly = false, requireBookManager = false }) {
  const { user, isAdmin, canManageBooks, loading } = useAuth()

  if (loading) {
    return <div className="page-loading">Loading…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />
  }

  if (requireBookManager && !canManageBooks) {
    return <Navigate to="/" replace />
  }

  return children
}
