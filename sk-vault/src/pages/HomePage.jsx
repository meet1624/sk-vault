import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchBooks, formatPrice, getDiscountedPrice } from '../lib/books'

const ROTATING = [
  'A growing library of titles, available instantly.',
  'Read on any device. Your library, always with you.',
  'Browse free titles or unlock the full catalog.',
  'Buy once, read forever. No subscription needed.',
]

export default function HomePage() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qi, setQi] = useState(0)
  const [qv, setQv] = useState(true)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    let ok = true
    fetchBooks().then(({ data, error }) => {
      if (!ok) return
      if (error) setError(error.message)
      else setBooks(data || [])
      setLoading(false)
    })
    return () => { ok = false }
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      setQv(false)
      setTimeout(() => { setQi(i => (i + 1) % ROTATING.length); setQv(true) }, 320)
    }, 5000)
    return () => clearInterval(t)
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return books
    const q = query.toLowerCase()
    return books.filter(b =>
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.category?.toLowerCase().includes(q)
    )
  }, [books, query])

  const freeBooks = filtered.filter(b => b.is_free)
  const paidBooks = filtered.filter(b => !b.is_free)
  const featured = books[0] || null
  const isSearching = query.trim().length > 0

  return (
    <div className="home-page">

      {/* HERO */}
      {!isSearching && (
        <div className="hero">
          <div className="hero-left">
            <div className="hero-eyebrow">✦ SK-Vault</div>
            <h1>Read more.<br /><em>Spend less.</em></h1>
            <p className="hero-sub" style={{ opacity: qv ? 1 : 0, transition: 'opacity .32s' }}>
              {ROTATING[qi]}
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}>
                Browse catalog
              </button>
              <Link className="btn-outline" to="/library">My Library</Link>
            </div>
          </div>
          <div className="hero-right" aria-hidden="true">
            <div className="hero-book" style={{ background: '#7C3AED' }}><span>📘</span></div>
            <div className="hero-book" style={{ background: '#0F766E' }}><span>🌿</span></div>
            <div className="hero-book" style={{ background: '#B45309' }}><span>✨</span></div>
          </div>
        </div>
      )}

      {/* TRUST STRIP */}
      {!isSearching && (
        <div className="strip">
          <div className="strip-inner">
            <div className="strip-item"><span className="strip-icon">⚡</span><div><div className="strip-label">Instant access</div><div className="strip-desc">Start reading the moment you unlock</div></div></div>
            <div className="strip-item"><span className="strip-icon">🔒</span><div><div className="strip-label">Secure & private</div><div className="strip-desc">Purchases tied to your account forever</div></div></div>
            <div className="strip-item"><span className="strip-icon">📱</span><div><div className="strip-label">Read anywhere</div><div className="strip-desc">Works on any device, any browser</div></div></div>
          </div>
        </div>
      )}

      {/* FEATURED */}
      {!isSearching && featured && (
        <div className="featured-band">
          <div className="featured-inner">
            <div className="featured-cover" style={{ background: featured.cover_image_url ? 'transparent' : (featured.color || '#B45309') }}>
              {featured.cover_image_url
                ? <img src={featured.cover_image_url} alt={featured.title} style={{ width:'100%',height:'100%',objectFit:'cover',position:'absolute',inset:0 }} />
                : <span style={{ position:'relative',zIndex:1 }}>{featured.emoji || '📚'}</span>}
            </div>
            <div>
              <div className="featured-label">✦ Featured title</div>
              <div className="featured-title">{featured.title}</div>
              <div className="featured-author">by {featured.author}</div>
              <div className="featured-desc">{featured.description || 'Explore this title and many more in the SK-Vault catalog.'}</div>
              <button className="btn btn-primary" onClick={() => navigate(`/book/${featured.id}`)}>
                {featured.is_free ? 'Read free →' : `Get for ${formatPrice(getDiscountedPrice(featured))} →`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEARCH + CATALOG */}
      <div className="section" id="catalog">

        {/* Search bar */}
        <div className="search-wrap">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search by title, author, or category…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear">✕</button>
            )}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {/* Search results */}
        {isSearching && (
          <div style={{ marginBottom: 28 }}>
            <div className="shelf-title" style={{ marginBottom: 4 }}>
              {filtered.length === 0 ? 'No results' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`}
            </div>
            <div className="shelf-sub">for "{query}"</div>
          </div>
        )}

        {isSearching && filtered.length === 0 && !loading && (
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <p>No books found for "{query}". Try a different search.</p>
          </div>
        )}

        {isSearching && filtered.length > 0 && (
          <div className="books-grid">
            {filtered.map(b => <BookCard key={b.id} book={b} onClick={() => navigate(`/book/${b.id}`)} />)}
          </div>
        )}

        {/* Normal shelves */}
        {!isSearching && !loading && books.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <p>The shelf is empty for now. Check back soon.</p>
          </div>
        )}

        {!isSearching && freeBooks.length > 0 && (
          <>
            <div className="shelf-header">
              <div>
                <div className="shelf-title">Free to read</div>
                <div className="shelf-sub">{freeBooks.length} title{freeBooks.length !== 1 ? 's' : ''} · no purchase needed</div>
              </div>
            </div>
            <div className="books-grid" style={{ marginBottom: 52 }}>
              {freeBooks.map(b => <BookCard key={b.id} book={b} onClick={() => navigate(`/book/${b.id}`)} />)}
            </div>
          </>
        )}

        {!isSearching && paidBooks.length > 0 && (
          <>
            <div className="shelf-header">
              <div>
                <div className="shelf-title">Premium titles</div>
                <div className="shelf-sub">{paidBooks.length} title{paidBooks.length !== 1 ? 's' : ''} · buy once, read forever</div>
              </div>
            </div>
            <div className="books-grid">
              {paidBooks.map(b => <BookCard key={b.id} book={b} onClick={() => navigate(`/book/${b.id}`)} />)}
            </div>
          </>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="books-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="book-card" style={{ pointerEvents:'none' }}>
                <div className="book-cover" style={{ background:'var(--bg3)' }} />
                <div className="book-info">
                  <div style={{ height:13,background:'var(--bg3)',borderRadius:4,marginBottom:7 }} />
                  <div style={{ height:11,background:'var(--bg3)',borderRadius:4,width:'60%',marginBottom:14 }} />
                  <div style={{ height:30,background:'var(--bg3)',borderRadius:6 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Link({ to, className, children }) {
  const navigate = useNavigate()
  return <button className={className} onClick={() => navigate(to)}>{children}</button>
}

function BookCard({ book, onClick }) {
  const discounted = getDiscountedPrice(book)
  const hasDiscount = !book.is_free && book.discount_percent > 0
  return (
    <div className="book-card" onClick={onClick}>
      <div className="book-cover" style={{ background: book.cover_image_url ? 'transparent' : (book.color || '#8B6F47') }}>
        {book.cover_image_url
          ? <img src={book.cover_image_url} alt={book.title} className="book-cover-img" />
          : <span style={{ position:'relative',zIndex:1 }}>{book.emoji || '📚'}</span>}
        {book.is_free && <span className="book-badge badge-free">FREE</span>}
      </div>
      <div className="book-info">
        <div className="book-title">{book.title}</div>
        <div className="book-author">{book.author}</div>
        {(book.language || book.category) && (
          <div className="book-meta-row">
            {book.language && <span className="book-lang-tag">🌐 {book.language}</span>}
            {book.category && <span className="book-cat-tag">{book.category.split(',')[0].trim()}</span>}
          </div>
        )}
        <div className="book-price-row">
          {book.is_free
            ? <span className="price-main">Free</span>
            : <>
                <span className="price-main">{formatPrice(discounted)}</span>
                {hasDiscount && <span className="price-original">{formatPrice(book.price_cents)}</span>}
                {hasDiscount && <span className="badge-sale-inline">-{book.discount_percent}%</span>}
              </>}
        </div>
        <button className={`book-buy-btn${book.is_free ? ' free' : ''}`}>
          {book.is_free ? 'Read free' : 'View book'}
        </button>
      </div>
    </div>
  )
}
