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
            <a href="/">Browse catalog</a>
            <a href="/library">My Library</a>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Account</div>
            <a href="/login">Log in</a>
            <a href="/signup">Sign up</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="footer-copy">© {new Date().getFullYear()} SK-Vault. All rights reserved.</span>
          <div className="footer-legal">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Support</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
