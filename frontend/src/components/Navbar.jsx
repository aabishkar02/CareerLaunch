import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogOut, LayoutDashboard, Menu, X, BookOpen, CreditCard } from 'lucide-react'

export default function Navbar() {
  const { user, logout, getRedirect } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    navigate('/')
  }

  const scrollToSection = (id) => (e) => {
    e.preventDefault()
    setMenuOpen(false)
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 100)
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <>
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <Link to="/" className="navbar-brand">
          Career<span>Launch</span>
        </Link>

        {/* Desktop links */}
        <div className="navbar-links">
          <Link to="/courses">Courses</Link>
          <a
            href="/#plans"
            onClick={scrollToSection('plans')}
            style={{ color: 'var(--text2)', fontSize: 14, fontWeight: 500, padding: '7px 14px', borderRadius: 'var(--radius-md)', transition: 'all var(--t)' }}
          >
            Plans
          </a>

          {user ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 400, padding: '6px 8px' }}>
                {user.first_name || user.email}
              </span>
              <Link
                to={getRedirect(user)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 14, fontWeight: 500, padding: '7px 14px', borderRadius: 'var(--radius-md)', transition: 'all var(--t)' }}
              >
                <LayoutDashboard size={14} />
                Dashboard
              </Link>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleLogout}
                style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <LogOut size={13} />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                style={{ color: 'var(--text2)', fontSize: 14, fontWeight: 500, padding: '7px 14px', borderRadius: 'var(--radius-md)', transition: 'all var(--t)' }}
              >
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm" style={{ marginLeft: 4 }}>Get started</Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="nav-hamburger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen
            ? <X size={18} />
            : <>
                <span />
                <span />
                <span />
              </>
          }
        </button>
      </nav>

      {/* Mobile nav drawer */}
      <div className={`mobile-nav${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        <div className="mobile-nav-section">Explore</div>
        <Link to="/courses" className="mobile-nav-link">
          <BookOpen size={18} color="var(--accent)" />
          Courses
        </Link>
        <a
          href="/#plans"
          className="mobile-nav-link"
          onClick={scrollToSection('plans')}
        >
          <CreditCard size={18} color="var(--accent)" />
          Plans &amp; Pricing
        </a>

        <div className="mobile-nav-divider" />

        {user ? (
          <>
            <div className="mobile-nav-section">Account</div>
            <Link to={getRedirect(user)} className="mobile-nav-link">
              <LayoutDashboard size={18} color="var(--accent)" />
              Go to Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="mobile-nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', color: 'var(--danger)', fontFamily: 'var(--font-sans)' }}
            >
              <LogOut size={18} />
              Sign out
            </button>
          </>
        ) : (
          <>
            <div className="mobile-nav-section">Account</div>
            <Link to="/login" className="mobile-nav-link">Sign in</Link>
            <div style={{ padding: '8px 0' }}>
              <Link to="/register" className="btn btn-primary btn-full" style={{ fontSize: 15 }}>Get started</Link>
            </div>
          </>
        )}
      </div>
    </>
  )
}
