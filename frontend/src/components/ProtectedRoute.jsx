import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <span className="spinner" />
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  if (role && user.role !== role) {
    if (user.role === 'admin')   return <Navigate to="/admin"     replace />
    if (user.role === 'tutor')   return <Navigate to="/tutor"     replace />
    if (user.role === 'student') return <Navigate to="/dashboard" replace />
    return <Navigate to="/" replace />
  }

  return children
}
