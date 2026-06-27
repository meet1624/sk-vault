import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-brand-name">SK-Vault</div>
            <p className="footer-tagline">A curated digital library. Buy once, read forever, on any device.</p>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Store</div>
            <Link to="/">Browse catalog</Link>
            <Link to="/library">My Library</Link>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Account</div>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-copy">© {new Date().getFullYear()} SK-Vault. All rights reserved.</span>
          <div className="footer-legal">
            <span style={{fontSize:12,color:'var(--ink3)'}}>Privacy</span>
            <span style={{fontSize:12,color:'var(--ink3)'}}>Terms</span>
            <span style={{fontSize:12,color:'var(--ink3)'}}>Support</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
