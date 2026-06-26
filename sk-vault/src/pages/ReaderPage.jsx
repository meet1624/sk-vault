import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useAuth } from '../context/AuthContext'
import { fetchBookById, getBookFileUrl, hasUserPurchased } from '../lib/books'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export default function ReaderPage() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const pdfDocRef = useRef(null)
  const containerRef = useRef(null)
  const canvasRefs = useRef({})
  const renderedPages = useRef(new Set())
  const intersectingPages = useRef(new Set())

  const [book, setBook] = useState(null)
  const [status, setStatus] = useState('loading') // loading | denied | no-file | ready | error
  const [errorMsg, setErrorMsg] = useState('')
  const [pageNum, setPageNum] = useState(1) // page currently in view (for the indicator)
  const [totalPages, setTotalPages] = useState(0)
  const [pageAspect, setPageAspect] = useState(1.414) // height/width, used to size placeholders

  // Block the most common "save/print/copy" shortcuts while reading.
  // Worth being upfront: this deters casual copying, it does not stop
  // a determined person (e.g. screenshots always work). Real protection
  // is the access control on the file itself, not this.
  useEffect(() => {
    function blockKeys(e) {
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', blockKeys)
    return () => document.removeEventListener('keydown', blockKeys)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')

      const { data: bookData, error: bookError } = await fetchBookById(id)
      if (cancelled) return
      if (bookError || !bookData) {
        setErrorMsg(bookError?.message || 'Book not found')
        setStatus('error')
        return
      }
      setBook(bookData)

      if (!bookData.file_path) {
        setStatus('no-file')
        return
      }

      // Access check happens twice: once here for a clean UI message,
      // and again for real by the storage RLS policy itself. Even if
      // someone bypassed this frontend check, the signed URL request
      // below would still fail server-side for a non-owner.
      // Admins can preview any book regardless of purchase status --
      // the storage policy already allows this server-side, so the
      // frontend check needs to match it.
      const allowed =
        isAdmin || bookData.is_free || (user && (await hasUserPurchased(user.id, id)))
      if (!allowed) {
        setStatus('denied')
        return
      }

      const { url, error: urlError } = await getBookFileUrl(bookData.file_path)
      if (cancelled) return
      if (urlError || !url) {
        setErrorMsg(urlError?.message || 'Could not load file')
        setStatus('error')
        return
      }

      try {
        const loadingTask = pdfjsLib.getDocument({ url })
        const pdf = await loadingTask.promise
        if (cancelled) return
        pdfDocRef.current = pdf
        setTotalPages(pdf.numPages)

        // Most PDFs use a consistent page size, so the first page's
        // aspect ratio is used to size every page's placeholder box
        // before it has actually rendered (keeps scroll height stable).
        const firstPage = await pdf.getPage(1)
        const baseViewport = firstPage.getViewport({ scale: 1 })
        if (!cancelled) setPageAspect(baseViewport.height / baseViewport.width)

        setPageNum(1)
        setStatus('ready')
      } catch (err) {
        setErrorMsg(err.message)
        setStatus('error')
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, user])

  // Lazily render pages as they scroll into (or near) view, instead of
  // rendering every page up front -- important for books with hundreds
  // of pages.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || totalPages === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const num = Number(entry.target.dataset.page)
          if (entry.isIntersecting) {
            intersectingPages.current.add(num)
            renderPage(num)
          } else {
            intersectingPages.current.delete(num)
          }
        })
        if (intersectingPages.current.size > 0) {
          setPageNum(Math.min(...intersectingPages.current))
        }
      },
      { root: containerRef.current, rootMargin: '900px 0px', threshold: 0.01 }
    )

    const wrappers = containerRef.current.querySelectorAll('.pdf-page-wrap')
    wrappers.forEach((w) => observer.observe(w))

    return () => observer.disconnect()
  }, [status, totalPages])

  async function renderPage(num) {
    if (renderedPages.current.has(num)) return
    renderedPages.current.add(num)

    const pdf = pdfDocRef.current
    const canvas = canvasRefs.current[num]
    if (!pdf || !canvas) return

    const page = await pdf.getPage(num)
    const containerWidth = canvas.parentElement.clientWidth
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = containerWidth / baseViewport.width
    const viewport = page.getViewport({ scale })

    canvas.width = viewport.width
    canvas.height = viewport.height

    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
  }

  function scrollToPage(num) {
    const target = containerRef.current?.querySelector(`[data-page="${num}"]`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function goPrev() {
    if (pageNum > 1) scrollToPage(pageNum - 1)
  }
  function goNext() {
    if (pageNum < totalPages) scrollToPage(pageNum + 1)
  }

  function close() {
    navigate(`/book/${id}`)
  }

  if (status === 'loading') {
    return <div className="reader-overlay"><div className="reader-body"><p style={{ color: '#888' }}>Loading book…</p></div></div>
  }

  if (status === 'denied') {
    return (
      <div className="reader-overlay">
        <div className="reader-body" style={{ flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#fff', fontSize: 18 }}>🔒 You don't have access to this book.</p>
          <button className="btn btn-primary" onClick={() => navigate(`/book/${id}`)}>
            Go to book page
          </button>
        </div>
      </div>
    )
  }

  if (status === 'no-file') {
    return (
      <div className="reader-overlay">
        <div className="reader-body" style={{ flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#fff', fontSize: 18 }}>⚠️ This book has no file uploaded yet.</p>
          <button className="btn btn-primary" onClick={close}>Go back</button>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="reader-overlay">
        <div className="reader-body" style={{ flexDirection: 'column', gap: 16 }}>
          <p style={{ color: '#f87171' }}>Something went wrong: {errorMsg}</p>
          <button className="btn btn-primary" onClick={close}>Go back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="reader-overlay">
      <div className="reader-header">
        <div className="reader-title">{book?.title}</div>
        <div className="reader-controls">
          <button className="action-btn" onClick={goPrev} disabled={pageNum <= 1}>← Prev</button>
          <span style={{ color: '#aaa', fontSize: 13 }}>{pageNum} / {totalPages}</span>
          <button className="action-btn" onClick={goNext} disabled={pageNum >= totalPages}>Next →</button>
          <button className="action-btn" onClick={close}>✕ Close</button>
        </div>
      </div>
      <div className="reader-body" ref={containerRef}>
        <div className="pdf-scroll-list">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
            <div
              key={num}
              className="pdf-page-wrap"
              data-page={num}
              style={{ aspectRatio: `1 / ${pageAspect}` }}
            >
              <canvas ref={(el) => { if (el) canvasRefs.current[num] = el }} />
              <span className="pdf-page-number">{num} / {totalPages}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
