import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchBookById, getBookFileUrl, hasUserPurchased } from '../lib/books'

// Use CDN worker — avoids ALL version/build tool conflicts
const PDFJS_VERSION = '4.4.168'
let pdfjsLib = null

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib
  // Dynamically import so Vite doesn't bundle the worker
  const mod = await import('pdfjs-dist')
  mod.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`
  pdfjsLib = mod
  return mod
}

export default function ReaderPage() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const pdfDocRef = useRef(null)
  const renderTaskRef = useRef(null)

  const [book, setBook] = useState(null)
  const [status, setStatus] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [pageNum, setPageNum] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [rendering, setRendering] = useState(false)

  // Block copy/print shortcuts on desktop
  useEffect(() => {
    function blockKeys(e) {
      if ((e.ctrlKey || e.metaKey) && ['p','s','c','u'].includes(e.key.toLowerCase()))
        e.preventDefault()
    }
    document.addEventListener('keydown', blockKeys)
    return () => document.removeEventListener('keydown', blockKeys)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const { data: bookData, error: bookError } = await fetchBookById(id)
        if (cancelled) return
        if (bookError || !bookData) {
          setErrorMsg(bookError?.message || 'Book not found')
          setStatus('error'); return
        }
        setBook(bookData)

        if (!bookData.file_path) { setStatus('no-file'); return }

        const allowed = isAdmin || bookData.is_free || (user && (await hasUserPurchased(user.id, id)))
        if (cancelled) return
        if (!allowed) { setStatus('denied'); return }

        const { url, error: urlError } = await getBookFileUrl(bookData.file_path)
        if (cancelled) return
        if (urlError || !url) {
          setErrorMsg(urlError?.message || 'Could not load file')
          setStatus('error'); return
        }

        const pdfjs = await getPdfJs()
        if (cancelled) return

        const pdf = await pdfjs.getDocument({
          url,
          cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/standard_fonts/`,
        }).promise

        if (cancelled) return
        pdfDocRef.current = pdf
        setTotalPages(pdf.numPages)
        setPageNum(1)
        setStatus('ready')
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Failed to load PDF')
          setStatus('error')
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, user, isAdmin])

  const renderPage = useCallback(async (num) => {
    if (!pdfDocRef.current || !canvasRef.current) return

    // Cancel previous render
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel() } catch (_) {}
      renderTaskRef.current = null
    }

    setRendering(true)
    try {
      const page = await pdfDocRef.current.getPage(num)
      const canvas = canvasRef.current
      if (!canvas) return

      // Wait for container width on mobile
      const container = containerRef.current
      let containerWidth = container?.clientWidth || 0
      if (containerWidth < 10) {
        await new Promise(r => setTimeout(r, 100))
        containerWidth = container?.clientWidth || (window.innerWidth - 32)
      }

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = (containerWidth / baseViewport.width) * pixelRatio
      const viewport = page.getViewport({ scale })

      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = containerWidth + 'px'
      canvas.style.height = Math.floor(viewport.height / pixelRatio) + 'px'

      const ctx = canvas.getContext('2d')
      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise
      renderTaskRef.current = null
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Render error:', err)
      }
    } finally {
      setRendering(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'ready') renderPage(pageNum)
  }, [status, pageNum, renderPage])

  // Re-render on resize / orientation change
  useEffect(() => {
    if (status !== 'ready') return
    let timer
    function onResize() {
      clearTimeout(timer)
      timer = setTimeout(() => renderPage(pageNum), 250)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      clearTimeout(timer)
    }
  }, [status, pageNum, renderPage])

  function goPrev() { if (pageNum > 1) setPageNum(p => p - 1) }
  function goNext() { if (pageNum < totalPages) setPageNum(p => p + 1) }
  function close() { navigate(`/book/${id}`) }

  const center = {
    display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center',
    gap:16, padding:32, textAlign:'center', flex:1
  }

  if (status === 'loading') return (
    <div className="reader-overlay">
      <div style={center}>
        <div style={{ fontSize:40 }}>📖</div>
        <p style={{ color:'var(--ink2)', fontSize:16 }}>Loading book…</p>
      </div>
    </div>
  )

  if (status === 'denied') return (
    <div className="reader-overlay">
      <div style={center}>
        <div style={{ fontSize:44 }}>🔒</div>
        <p style={{ color:'var(--ink)', fontSize:17, fontWeight:700 }}>Access restricted</p>
        <p style={{ color:'var(--ink2)', fontSize:14 }}>Purchase this book to read it.</p>
        <button className="btn btn-primary" onClick={() => navigate(`/book/${id}`)}>Go to book page</button>
      </div>
    </div>
  )

  if (status === 'no-file') return (
    <div className="reader-overlay">
      <div style={center}>
        <div style={{ fontSize:44 }}>⚠️</div>
        <p style={{ color:'var(--ink)', fontSize:17, fontWeight:700 }}>No file uploaded yet</p>
        <p style={{ color:'var(--ink2)', fontSize:14 }}>The publisher hasn't uploaded this book's file.</p>
        <button className="btn btn-secondary" onClick={close}>Go back</button>
      </div>
    </div>
  )

  if (status === 'error') return (
    <div className="reader-overlay">
      <div style={center}>
        <div style={{ fontSize:44 }}>😕</div>
        <p style={{ color:'var(--danger)', fontSize:16, fontWeight:700 }}>Something went wrong</p>
        <p style={{ color:'var(--ink2)', fontSize:13, maxWidth:300, lineHeight:1.6 }}>{errorMsg}</p>
        <button className="btn btn-secondary" onClick={close}>Go back</button>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </div>
  )

  return (
    <div className="reader-overlay">
      <div className="reader-header">
        <div className="reader-title">{book?.title}</div>
        <div className="reader-controls">
          <button className="action-btn" onClick={goPrev} disabled={pageNum <= 1 || rendering}>‹ Prev</button>
          <span style={{ fontSize:13, color:'var(--ink3)', whiteSpace:'nowrap', minWidth:64, textAlign:'center' }}>
            {pageNum} / {totalPages}
          </span>
          <button className="action-btn" onClick={goNext} disabled={pageNum >= totalPages || rendering}>Next ›</button>
          <button className="action-btn" onClick={close}>✕ Close</button>
        </div>
      </div>

      <div className="reader-body">
        <div className="pdf-container" ref={containerRef}>
          {rendering && (
            <div style={{
              position:'absolute', top:8, right:8,
              fontSize:11, color:'var(--ink3)',
              background:'var(--bg2)', padding:'3px 8px',
              borderRadius:4, zIndex:2
            }}>Rendering…</div>
          )}
          <canvas ref={canvasRef} style={{ display:'block' }} />
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="reader-footer">
        <button className="reader-page-btn" onClick={goPrev} disabled={pageNum <= 1 || rendering}>‹</button>
        <span style={{ fontSize:14, color:'var(--ink2)', fontWeight:600 }}>{pageNum} of {totalPages}</span>
        <button className="reader-page-btn" onClick={goNext} disabled={pageNum >= totalPages || rendering}>›</button>
      </div>
    </div>
  )
}
