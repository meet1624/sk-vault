import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Nav() {
  const { user, profile, isAdmin, canManageBooks, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await signOut()
    navigate('/')
    setMenuOpen(false)
  }

  return (
    <header className="nav">
      <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
        <span className="brand-dot" />
        SK-Vault
      </Link>

      {/* Desktop links */}
      <div className="nav-links nav-desktop">
        <Link to="/" className="nav-btn">Store</Link>
        {user && <Link to="/library" className="nav-btn">My Library</Link>}
        {canManageBooks && (
          <Link to="/admin" className="nav-btn admin-badge">
            {isAdmin ? 'Admin' : 'Manage'}
          </Link>
        )}
        {user ? (
          <>
            <span className="nav-user-email">{profile?.full_name || user.email}</span>
            <button className="nav-btn" onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-btn">Log in</Link>
            <Link to="/signup" className="nav-btn primary">Sign up</Link>
          </>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        className="nav-hamburger"
        onClick={() => setMenuOpen(o => !o)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        <span className={`ham-line ${menuOpen ? 'open' : ''}`} />
        <span className={`ham-line ${menuOpen ? 'open' : ''}`} />
        <span className={`ham-line ${menuOpen ? 'open' : ''}`} />
      </button>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="nav-drawer" onClick={() => setMenuOpen(false)}>
          <Link to="/" className="drawer-item">Store</Link>
          {user && <Link to="/library" className="drawer-item">My Library</Link>}
          {canManageBooks && (
            <Link to="/admin" className="drawer-item">
              {isAdmin ? 'Admin' : 'Manage'}
            </Link>
          )}
          {user ? (
            <>
              <div className="drawer-email">{profile?.full_name || user.email}</div>
              <button className="drawer-item drawer-logout" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" className="drawer-item">Log in</Link>
              <Link to="/signup" className="drawer-item drawer-signup">Sign up free</Link>
            </>
          )}
        </div>
      )}
    </header>
  )
}
