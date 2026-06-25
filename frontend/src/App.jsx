import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ToastContainer from './components/ToastContainer'
import ConfirmDialog from './components/ConfirmDialog'

// Route-level code splitting — visitors only download the pages they visit
const Landing          = lazy(() => import('./pages/Landing'))
const Login            = lazy(() => import('./pages/auth/Login'))
const Register         = lazy(() => import('./pages/auth/Register'))
const AdminLogin       = lazy(() => import('./pages/auth/AdminLogin'))
const ForgotPassword   = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword    = lazy(() => import('./pages/auth/ResetPassword'))
const Checkout         = lazy(() => import('./pages/Checkout'))
const CoursesPage      = lazy(() => import('./pages/Courses'))
const CourseDetail     = lazy(() => import('./pages/CourseDetail'))
const PlanDetail       = lazy(() => import('./pages/PlanDetail'))
const ModuleDetail     = lazy(() => import('./pages/ModuleDetail'))
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'))
const TutorDashboard   = lazy(() => import('./pages/tutor/Dashboard'))
const AdminDashboard   = lazy(() => import('./pages/admin/Dashboard'))

// Reset scroll on navigation (except in-page hash links)
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

function PageLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <span className="spinner" role="status" aria-label="Loading page" style={{ width: 28, height: 28 }} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ToastContainer />
      <ConfirmDialog />
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"                element={<Landing />} />
          <Route path="/courses"         element={<CoursesPage />} />
          <Route path="/courses/:slug"   element={<CourseDetail />} />
          <Route path="/plans"           element={<PlanDetail />} />
          <Route path="/plans/:planId"   element={<PlanDetail />} />
          <Route path="/modules/:slug"   element={<ModuleDetail />} />
          <Route path="/login"           element={<Login />} />
          <Route path="/register"        element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password"  element={<ResetPassword />} />
          <Route path="/admin/login"     element={<AdminLogin />} />

          <Route path="/checkout" element={
            <ProtectedRoute><Checkout /></ProtectedRoute>
          } />

          <Route path="/dashboard/*" element={
            <ProtectedRoute role="student"><StudentDashboard /></ProtectedRoute>
          } />

          <Route path="/tutor/*" element={
            <ProtectedRoute role="tutor"><TutorDashboard /></ProtectedRoute>
          } />

          <Route path="/admin/*" element={
            <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
          } />

          <Route path="*" element={
            <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:48, color:'var(--text3)' }}>404</div>
              <div style={{ color:'var(--text2)' }}>Page not found</div>
              <Link to="/">← Go home</Link>
            </div>
          } />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
