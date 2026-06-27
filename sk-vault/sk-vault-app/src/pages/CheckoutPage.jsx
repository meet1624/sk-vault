import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchBookById, formatPrice, getDiscountedPrice } from '../lib/books'
import { loadRazorpayScript, createRazorpayOrder, verifyRazorpayPayment } from '../lib/payments'

export default function CheckoutPage() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchBookById(id).then(({ data }) => {
      setBook(data)
      setLoading(false)
    })
  }, [id])

  async function handlePay() {
    setError('')
    setPaying(true)
    try {
      await loadRazorpayScript()
      const order = await createRazorpayOrder(id)

      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'SK-Vault',
        description: book.title,
        prefill: {
          name: profile?.full_name || '',
          email: user?.email || '',
        },
        theme: { color: '#6c63ff' },
        handler: async function (response) {
          try {
            await verifyRazorpayPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              book_id: id,
            })
            navigate(`/read/${id}`)
          } catch (err) {
            setError(`Payment was made but verification failed: ${err.message}. Contact support with your payment ID: ${response.razorpay_payment_id}`)
          } finally {
            setPaying(false)
          }
        },
        modal: {
          ondismiss: function () {
            setPaying(false)
          },
        },
      })

      rzp.on('payment.failed', function (response) {
        setError(`Payment failed: ${response.error.description}`)
        setPaying(false)
      })

      rzp.open()
    } catch (err) {
      setError(err.message)
      setPaying(false)
    }
  }

  if (loading) return <div className="section"><p>Loading…</p></div>
  if (!book) return <div className="section"><p>Book not found.</p></div>

  const discounted = getDiscountedPrice(book)

  return (
    <div className="section" style={{ maxWidth: 480 }}>
      <h2 className="section-title">Checkout</h2>
      <div className="payment-modal">
        <div className="book-preview">
          <div className="book-emo" style={{ background: book.color, borderRadius: 8 }}>{book.emoji}</div>
          <div>
            <div style={{ fontWeight: 800 }}>{book.title}</div>
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>{book.author}</div>
          </div>
        </div>
        <div className="amount">{formatPrice(discounted)}</div>

        {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

        <button className="rzp-btn" onClick={handlePay} disabled={paying}>
          {paying ? 'Processing…' : '🔒 Pay securely with Razorpay'}
        </button>
        <button
          className="btn btn-secondary"
          style={{ marginTop: 12, width: '100%' }}
          onClick={() => navigate(`/book/${id}`)}
          disabled={paying}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
