import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchBookById, formatPrice, getDiscountedPrice, hasUserPurchased } from '../lib/books'

export default function BookDetailPage() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [book, setBook] = useState(null)
  const [owned, setOwned] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true
    async function load() {
      const { data, error } = await fetchBookById(id)
      if (!isMounted) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setBook(data)

      if (user) {
        const purchased = await hasUserPurchased(user.id, id)
        if (isMounted) setOwned(purchased)
      }
      setLoading(false)
    }
    load()
    return () => { isMounted = false }
  }, [id, user])

  if (loading) return <div className="section"><p>Loading…</p></div>
  if (error) return <div className="section"><p className="form-error">{error}</p></div>
  if (!book) return <div className="section"><p>Book not found.</p></div>

  const discounted = getDiscountedPrice(book)
  const hasDiscount = !book.is_free && book.discount_percent > 0
  const canRead = book.is_free || owned || isAdmin

  function handlePrimaryAction() {
    if (!user) {
      navigate('/login')
      return
    }
    if (canRead) {
      navigate(`/read/${book.id}`)
    } else {
      navigate(`/checkout/${book.id}`)
    }
  }

  return (
    <div className="section book-detail-section">
      <div className="book-detail-card">
        <div className="book-detail-cover-wrap">
          <div className="book-detail-glow" style={{ background: book.color }} />
          <div className="book-detail-cover" style={{ background: book.cover_image_url ? 'transparent' : book.color }}>
            {book.cover_image_url ? (
              <img src={book.cover_image_url} alt={book.title} className="book-cover-img" />
            ) : (
              book.emoji
            )}
            {book.is_free && <span className="book-badge badge-free">FREE</span>}
          </div>
        </div>

        <div className="book-detail-info">
          <h1 className="book-detail-title">{book.title}</h1>
          <p className="book-detail-author">by {book.author}</p>
          <p className="book-detail-meta">
            {book.category}{book.pages ? ` · ${book.pages} pages` : ''}
          </p>

          <div className="book-price-row" style={{ margin: '20px 0 24px' }}>
            {book.is_free ? (
              <span className="price-main" style={{ fontSize: 26 }}>Free</span>
            ) : (
              <>
                <span className="price-main" style={{ fontSize: 26 }}>{formatPrice(discounted)}</span>
                {hasDiscount && (
                  <span className="price-original">{formatPrice(book.price_cents)}</span>
                )}
                {hasDiscount && (
                  <span className="badge-sale-inline">-{book.discount_percent}%</span>
                )}
              </>
            )}
          </div>

          <button className="btn btn-primary" onClick={handlePrimaryAction}>
            {!user
              ? 'Log in to continue'
              : canRead
              ? 'Read Now'
              : `Buy for ${formatPrice(discounted)}`}
          </button>
        </div>
      </div>

      <div className="book-detail-about">
        <h3 className="serif">About this book</h3>
        <p>{book.description || 'No description yet.'}</p>
      </div>
    </div>
  )
}
