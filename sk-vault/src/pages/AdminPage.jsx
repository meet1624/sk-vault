import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchBooks, formatPrice } from '../lib/books'
import { sendPurchaseReminder } from '../lib/payments'
import { useAuth } from '../context/AuthContext'

const EMOJIS = ['📚','📖','🎓','💡','🔥','⚡','🌟','🎯','🧠','📝','🚀','💎','🌈','🎨','🔮','🎵']
const COLORS = ['#6c63ff','#ec4899','#f59e0b','#10b981','#38bdf8','#f97316','#a78bfa','#14b8a6']
const LANGUAGES = ['English', 'Hindi', 'Hinglish', 'Gujarati', 'Marathi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali', 'Punjabi', 'Urdu']

const emptyForm = {
  id: null,
  title: '',
  author: '',
  description: '',
  category: '',
  emoji: EMOJIS[0],
  color: COLORS[0],
  price_cents: 0,
  discount_percent: 0,
  is_free: false,
  pages: '',
  language: 'English',
  cover_image_url: '',
}

export default function AdminPage() {
  const { user: currentUser, isAdmin } = useAuth()
  const [section, setSection] = useState('books')
  const [books, setBooks] = useState([])
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [purchases, setPurchases] = useState([])
  const [purchasesLoading, setPurchasesLoading] = useState(true)
  const [sendingReminder, setSendingReminder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function loadUsers() {
    setUsersLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setUsers(data)
    setUsersLoading(false)
  }

  async function loadPurchases() {
    setPurchasesLoading(true)
    const { data, error } = await supabase
      .from('purchases')
      .select('id, status, amount_paid_cents, created_at, reminder_sent_at, user_id, book_id, profiles(email, full_name), books(title, cover_image_url, emoji, color)')
      .order('created_at', { ascending: false })
    if (!error) setPurchases(data)
    setPurchasesLoading(false)
  }

  async function handleSendReminder(purchaseId) {
    setSendingReminder(purchaseId)
    try {
      await sendPurchaseReminder(purchaseId)
      showToast('Reminder email sent ✓')
      loadPurchases()
    } catch (err) {
      showToast(`Failed to send: ${err.message}`)
    } finally {
      setSendingReminder(null)
    }
  }

  async function handleRoleChange(targetUser, newRole) {
    if (targetUser.id === currentUser.id) {
      showToast("You can't change your own role.")
      return
    }

    const messages = {
      admin: `Give full admin access to ${targetUser.email}? They'll be able to manage books AND users.`,
      editor: `Give editor access to ${targetUser.email}? They'll be able to manage books, but not users.`,
      user: `Remove admin/editor access from ${targetUser.email}?`,
    }
    if (!confirm(messages[newRole])) return

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUser.id)

    if (error) {
      showToast(`Failed: ${error.message}`)
    } else {
      const toastMessages = {
        admin: 'User promoted to admin',
        editor: 'User given editor access',
        user: 'Access removed',
      }
      showToast(toastMessages[newRole])
      loadUsers()
    }
  }

  useEffect(() => {
    if (section === 'users' && isAdmin) loadUsers()
    if (section === 'purchases') loadPurchases()
  }, [section])

  async function loadBooks() {
    setLoading(true)
    const { data, error } = await fetchBooks()
    if (!error) setBooks(data)
    setLoading(false)
  }

  useEffect(() => {
    loadBooks()
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function startEdit(book) {
    setForm({
      id: book.id,
      title: book.title,
      author: book.author,
      description: book.description || '',
      category: book.category || '',
      emoji: book.emoji || EMOJIS[0],
      color: book.color || COLORS[0],
      price_cents: book.price_cents,
      discount_percent: book.discount_percent,
      is_free: book.is_free,
      pages: book.pages || '',
      language: book.language || 'English',
      cover_image_url: book.cover_image_url || '',
    })
    setFile(null)
    setCoverFile(null)
    setCoverPreview(book.cover_image_url || null)
    setSection('upload')
  }

  function resetForm() {
    setForm(emptyForm)
    setFile(null)
    setCoverFile(null)
    setCoverPreview(null)
    setSection('books')
  }

  function handleCoverSelect(e) {
    const selected = e.target.files[0]
    if (!selected) return
    setCoverFile(selected)
    setCoverPreview(URL.createObjectURL(selected))
  }

  async function handleDelete(book) {
    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return
    // Remove the file from storage first (if any), then the row.
    if (book.file_path) {
      await supabase.storage.from('book-files').remove([book.file_path])
    }
    if (book.cover_image_url) {
      // Extract the storage path from the public URL to remove it
      const coverPath = book.cover_image_url.split('/book-covers/')[1]
      if (coverPath) {
        await supabase.storage.from('book-covers').remove([coverPath])
      }
    }
    const { error } = await supabase.from('books').delete().eq('id', book.id)
    if (error) {
      showToast(`Failed to delete: ${error.message}`)
    } else {
      showToast('Book deleted')
      loadBooks()
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.title.trim() || !form.author.trim()) {
      setError('Title and author are required.')
      return
    }

    setSaving(true)

    try {
      let filePath = form.file_path || null

      // Upload a new file if one was selected
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
        const path = `${Date.now()}_${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('book-files')
          .upload(path, file, { upsert: false })

        if (uploadError) throw uploadError
        filePath = path
      }

      // Upload a new cover image if one was selected. Covers live in a
      // PUBLIC bucket (book-covers) since they need to be visible on the
      // store page without any access check -- unlike the actual book
      // file, which stays in the private book-files bucket.
      let coverUrl = form.cover_image_url || null
      if (coverFile) {
        const safeName = coverFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
        const coverPath = `${Date.now()}_${safeName}`
        const { error: coverUploadError } = await supabase.storage
          .from('book-covers')
          .upload(coverPath, coverFile, { upsert: false })

        if (coverUploadError) throw coverUploadError

        const { data: publicUrlData } = supabase.storage
          .from('book-covers')
          .getPublicUrl(coverPath)
        coverUrl = publicUrlData.publicUrl
      }

      const payload = {
        title: form.title.trim(),
        author: form.author.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        emoji: form.emoji,
        color: form.color,
        price_cents: form.is_free ? 0 : Math.round(Number(form.price_cents) || 0),
        discount_percent: form.is_free ? 0 : Math.round(Number(form.discount_percent) || 0),
        is_free: form.is_free,
        pages: form.pages ? Number(form.pages) : null,
        language: form.language || 'English',
        ...(filePath ? { file_path: filePath } : {}),
        cover_image_url: coverUrl,
      }

      if (form.id) {
        const { error: updateError } = await supabase
          .from('books')
          .update(payload)
          .eq('id', form.id)
        if (updateError) throw updateError
        showToast('Book updated')
      } else {
        const { error: insertError } = await supabase.from('books').insert(payload)
        if (insertError) throw insertError
        showToast('Book created')
      }

      resetForm()
      loadBooks()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-layout">
      <div className="admin-sidebar">
        <div
          className={`sidebar-item ${section === 'books' ? 'active' : ''}`}
          onClick={() => setSection('books')}
        >
          Books
        </div>
        <div
          className={`sidebar-item ${section === 'upload' ? 'active' : ''}`}
          onClick={() => { setForm(emptyForm); setFile(null); setSection('upload') }}
        >
          Add Book
        </div>
        <div
          className={`sidebar-item ${section === 'purchases' ? 'active' : ''}`}
          onClick={() => setSection('purchases')}
        >
          Purchases
        </div>
        {isAdmin && (
          <div
            className={`sidebar-item ${section === 'users' ? 'active' : ''}`}
            onClick={() => setSection('users')}
          >
            Users
          </div>
        )}
      </div>

      <div className="admin-main">
        {toast && (
          <div className="toast show success" style={{ position: 'static', marginBottom: 16, display: 'inline-block', transform: 'none' }}>
            {toast}
          </div>
        )}

        {section === 'books' && (
          <>
            <h2 className="section-title">Manage Books</h2>
            {loading ? (
              <p>Loading…</p>
            ) : (
              <div className="book-table-wrap">
              <table className="book-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Title</th>
                    <th>Author</th>
                    <th>Language</th>
                    <th>Price</th>
                    <th>File</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book) => (
                    <tr key={book.id}>
                      <td>
                        <div className="tbl-cover" style={{ background: book.cover_image_url ? 'transparent' : book.color }}>
                          {book.cover_image_url ? (
                            <img src={book.cover_image_url} alt="" className="book-cover-img" />
                          ) : (
                            book.emoji
                          )}
                        </div>
                      </td>
                      <td>{book.title}</td>
                      <td>{book.author}</td>
                      <td>{book.language || '—'}</td>
                      <td>{book.is_free ? 'Free' : formatPrice(book.price_cents)}</td>
                      <td>{book.file_path ? '✅' : '⚠️ none'}</td>
                      <td>
                        <button className="action-btn" onClick={() => startEdit(book)}>Edit</button>
                        <button className="action-btn danger" onClick={() => handleDelete(book)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </>
        )}

        {section === 'upload' && (
          <>
            <h2 className="section-title">{form.id ? 'Edit Book' : 'Add New Book'}</h2>
            <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    className="form-input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Author</label>
                  <input
                    className="form-input"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input
                    className="form-input"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pages</label>
                  <input
                    className="form-input"
                    type="number"
                    value={form.pages}
                    onChange={(e) => setForm({ ...form, pages: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Language</label>
                <select
                  className="form-input"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={form.is_free}
                    onChange={(e) => setForm({ ...form, is_free: e.target.checked })}
                  />
                  <span className="slider-sw"></span>
                </label>
                <span style={{ marginLeft: 12 }}>Free book</span>
              </div>

              {!form.is_free && (
                <div className="form-row" id="pricing-fields">
                  <div className="form-group">
                    <label className="form-label">Price (₹)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={form.price_cents / 100}
                      onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) * 100 })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Discount %</label>
                    <input
                      className="form-input"
                      type="number"
                      value={form.discount_percent}
                      onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Cover image</label>
                <div className="cover-upload-row">
                  <div className="cover-preview" style={{ background: coverPreview ? 'transparent' : form.color }}>
                    {coverPreview ? (
                      <img src={coverPreview} alt="Cover preview" className="book-cover-img" />
                    ) : (
                      <span style={{ fontSize: 32 }}>{form.emoji}</span>
                    )}
                  </div>
                  <div className="upload-zone cover-upload-zone">
                    <input
                      type="file"
                      accept="image/*"
                      id="cover-file-input"
                      style={{ display: 'none' }}
                      onChange={handleCoverSelect}
                    />
                    <label htmlFor="cover-file-input" style={{ cursor: 'pointer', display: 'block' }}>
                      <div className="upload-zone-icon">🖼️</div>
                      <p>{coverFile ? <strong>{coverFile.name}</strong> : 'Click to upload a cover image'}</p>
                      <p style={{ fontSize: 12, marginTop: 4 }}>Recommended: portrait, e.g. 600×800px (JPG or PNG)</p>
                    </label>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                  No cover image? The emoji + color below will be used instead.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Fallback emoji (used if no cover image)</label>
                <div className="color-dots">
                  {EMOJIS.map((em) => (
                    <div
                      key={em}
                      className={`color-dot ${form.emoji === em ? 'selected' : ''}`}
                      style={{ background: 'var(--bg3)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => setForm({ ...form, emoji: em })}
                    >
                      {em}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Fallback color (used if no cover image)</label>
                <div className="color-dots">
                  {COLORS.map((c) => (
                    <div
                      key={c}
                      className={`color-dot ${form.color === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setForm({ ...form, color: c })}
                    />
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Book file (PDF)</label>
                <div className="upload-zone">
                  <input
                    type="file"
                    accept="application/pdf"
                    id="pdf-file-input"
                    style={{ display: 'none' }}
                    onChange={(e) => setFile(e.target.files[0])}
                  />
                  <label htmlFor="pdf-file-input" style={{ cursor: 'pointer', display: 'block' }}>
                    <div className="upload-zone-icon">📄</div>
                    <p>
                      {file ? <strong>{file.name}</strong> : <>Click to choose a PDF file</>}
                    </p>
                  </label>
                </div>
                {form.id && !file && (
                  <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                    Leave empty to keep the existing file.
                  </p>
                )}
              </div>

              {error && <p className="form-error">{error}</p>}

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Book'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}

        {section === 'purchases' && (
          <>
            <h2 className="section-title">Purchases</h2>
            <p className="section-sub">See who has purchased each book, and remind anyone with an incomplete payment.</p>
            {purchasesLoading ? (
              <p>Loading…</p>
            ) : purchases.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🧾</span>
                <p>No purchase activity yet.</p>
              </div>
            ) : (
              <div className="book-table-wrap">
                <table className="book-table">
                  <thead>
                    <tr>
                      <th>Buyer</th>
                      <th>Book</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.profiles?.full_name || '—'}</div>
                          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{p.profiles?.email}</div>
                        </td>
                        <td>{p.books?.title || '—'}</td>
                        <td>{formatPrice(p.amount_paid_cents)}</td>
                        <td>
                          {p.status === 'completed' ? (
                            <span className="tag" style={{ background: 'var(--forest-bg)', color: 'var(--forest)', border: '1px solid var(--forest-border)' }}>
                              ✓ Purchased
                            </span>
                          ) : (
                            <span className="tag tag-amber">Pending</span>
                          )}
                          {p.status !== 'completed' && p.reminder_sent_at && (
                            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                              Reminder sent {new Date(p.reminder_sent_at).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td>{new Date(p.created_at).toLocaleDateString()}</td>
                        <td>
                          {p.status !== 'completed' && (
                            <button
                              className="action-btn"
                              disabled={sendingReminder === p.id}
                              onClick={() => handleSendReminder(p.id)}
                            >
                              {sendingReminder === p.id ? 'Sending…' : p.reminder_sent_at ? 'Resend' : 'Send Reminder'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {section === 'users' && isAdmin && (
          <>
            <h2 className="section-title">Manage Users</h2>
            <p className="section-sub">Promote a user to admin, or remove admin access.</p>
            {usersLoading ? (
              <p>Loading…</p>
            ) : (
              <div className="book-table-wrap">
              <table className="book-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name || '—'}</td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`tag ${u.role === 'admin' ? 'tag-purple' : u.role === 'editor' ? 'tag-amber' : ''}`}>
                          {u.role}
                        </span>
                        {u.id === currentUser.id && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text3)' }}>(you)</span>
                        )}
                      </td>
                      <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td>
                        {u.id === currentUser.id ? (
                          <span style={{ fontSize: 12, color: 'var(--text3)' }}>—</span>
                        ) : (
                          <>
                            {u.role !== 'editor' && (
                              <button
                                className="action-btn"
                                onClick={() => handleRoleChange(u, 'editor')}
                              >
                                Make Editor
                              </button>
                            )}
                            {u.role === 'admin' ? (
                              <button
                                className="action-btn danger"
                                onClick={() => handleRoleChange(u, 'user')}
                              >
                                Remove Admin
                              </button>
                            ) : u.role === 'editor' ? (
                              <button
                                className="action-btn danger"
                                onClick={() => handleRoleChange(u, 'user')}
                              >
                                Remove Access
                              </button>
                            ) : (
                              <button
                                className="action-btn"
                                onClick={() => handleRoleChange(u, 'admin')}
                              >
                                Make Admin
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
