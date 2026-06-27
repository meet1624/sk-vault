import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchBooks, fetchUserPurchases } from '../lib/books'

export default function LibraryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [freeBooks, setFreeBooks] = useState([])
  const [purchasedBooks, setPurchasedBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function load() {
      setLoading(true)

      const [allBooksResult, purchasesResult] = await Promise.all([
        fetchBooks(),
        fetchUserPurchases(user.id),
      ])

      if (!isMounted) return

      if (allBooksResult.error) {
        setError(allBooksResult.error.message)
        setLoading(false)
        return
      }
      if (purchasesResult.error) {
        setError(purchasesResult.error.message)
        setLoading(false)
        return
      }

      const free = allBooksResult.data.filter((b) => b.is_free)
      // purchasesResult.data looks like [{ book_id, books: {...} }]
      const purchased = purchasesResult.data
        .map((p) => p.books)
        .filter(Boolean)
        // avoid double-listing a book if it's both free and somehow has a purchase row
        .filter((b) => !b.is_free)

      setFreeBooks(free)
      setPurchasedBooks(purchased)
      setLoading(false)
    }

    if (user) load()
    return () => { isMounted = false }
  }, [user])

  if (loading) {
    return (
      <div className="home-page">
        <div className="section"><p>Loading your library…</p></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="home-page">
        <div className="section"><p className="form-error">{error}</p></div>
      </div>
    )
  }

  const isEmpty = freeBooks.length === 0 && purchasedBooks.length === 0

  return (
    <div className="home-page">
      <div className="section">
        <h2 className="section-title">My Library</h2>
        <p className="section-sub">Your purchased and free books, ready to read.</p>

        {isEmpty && (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <p>Your library is empty. Browse the store to find something to read.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
              Browse Store
            </button>
          </div>
        )}

        {purchasedBooks.length > 0 && (
          <>
            <h3 className="library-subheading">Purchased</h3>
            <div className="books-grid">
              {purchasedBooks.map((book) => (
                <LibraryBookCard key={book.id} book={book} onClick={() => navigate(`/read/${book.id}`)} />
              ))}
            </div>
          </>
        )}

        {freeBooks.length > 0 && (
          <>
            <h3 className="library-subheading">Free Books</h3>
            <div className="books-grid">
              {freeBooks.map((book) => (
                <LibraryBookCard key={book.id} book={book} onClick={() => navigate(`/read/${book.id}`)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LibraryBookCard({ book, onClick }) {
  return (
    <div className="book-card" onClick={onClick}>
      <div className="book-cover" style={{ background: book.cover_image_url ? 'transparent' : (book.color || '#6c63ff') }}>
        {book.cover_image_url ? (
          <img src={book.cover_image_url} alt={book.title} className="book-cover-img" />
        ) : (
          book.emoji || '📚'
        )}
      </div>
      <div className="book-info">
        <div className="book-title">{book.title}</div>
        <div className="book-author">{book.author}</div>
        <button className="book-buy-btn free">Read</button>
      </div>
    </div>
  )
}
