import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import { useAuth } from '../context/AuthContext'
import { fetchBookById, getBookFileUrl, hasUserPurchased } from '../lib/books'

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs'

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168'

export default function ReaderPage() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const canvasRef = useRef(null)
  const pageContainerRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const pdfDocRef = useRef(null)
  const renderTaskRef = useRef(null)

  const [book, setBook] = useState(null)
  const [status, setStatus] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [pageNum, setPageNum] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [scrollLoading, setScrollLoading] = useState(false)
  const [mode, setMode] = useState('page')

  useEffect(() => {
    const block = e => {
      if ((e.ctrlKey || e.metaKey) && ['p','s','c','u'].includes(e.key.toLowerCase()))
        e.preventDefault()
    }
    document.addEventListener('keydown', block)
    return () => document.removeEventListener('keydown', block)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const { data: bookData, error: bookError } = await fetchBookById(id)
        if (cancelled) return
        if (bookError || !bookData) { setErrorMsg(bookError?.message || 'Book not found'); setStatus('error'); return }
        setBook(bookData)
        if (!bookData.file_path) { setStatus('no-file'); return }
        const allowed = isAdmin || bookData.is_free || (user && (await hasUserPurchased(user.id, id)))
        if (cancelled) return
        if (!allowed) { setStatus('denied'); return }
        const { url, error: urlError } = await getBookFileUrl(bookData.file_path)
        if (cancelled) return
        if (urlError || !url) { setErrorMsg(urlError?.message || 'Could not load file'); setStatus('error'); return }
        const pdf = await pdfjsLib.getDocument({ url, cMapUrl: `${CDN}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${CDN}/standard_fonts/` }).promise
        if (cancelled) return
        pdfDocRef.current = pdf
        setTotalPages(pdf.numPages)
        setPageNum(1)
        setStatus('ready')
      } catch (err) {
        if (!cancelled) { setErrorMsg(err?.message || 'Failed to load PDF'); setStatus('error') }
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, user, isAdmin])

  const renderPage = useCallback(async (num) => {
    if (!pdfDocRef.current || !canvasRef.current || !pageContainerRef.current) return
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel() } catch (_) {} renderTaskRef.current = null }
    setRendering(true)
    try {
      const page = await pdfDocRef.current.getPage(num)
      const canvas = canvasRef.current
      if (!canvas) return
      let w = pageContainerRef.current.clientWidth || 0
      if (w < 10) { await new Promise(r => setTimeout(r, 120)); w = pageContainerRef.current.clientWidth || window.innerWidth - 32 }
      const pr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: (w / page.getViewport({ scale: 1 }).width) * pr })
      canvas.width = viewport.width; canvas.height = viewport.height
      canvas.style.width = w + 'px'; canvas.style.height = Math.floor(viewport.height / pr) + 'px'
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport })
      renderTaskRef.current = task
      await task.promise
      renderTaskRef.current = null
    } catch (err) { if (err?.name !== 'RenderingCancelledException') console.error(err) }
    finally { setRendering(false) }
  }, [])

  const renderAllPages = useCallback(async () => {
    const container = scrollContainerRef.current
    if (!pdfDocRef.current || !container) return
    setScrollLoading(true)
    container.innerHTML = ''
    let w = container.clientWidth || 0
    if (w < 10) { await new Promise(r => setTimeout(r, 150)); w = container.clientWidth || window.innerWidth - 24 }
    const pr = Math.min(window.devicePixelRatio || 1, 2)
    const pdf = pdfDocRef.current
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: (w / page.getViewport({ scale: 1 }).width) * pr })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width; canvas.height = viewport.height
        canvas.style.width = w + 'px'; canvas.style.height = Math.floor(viewport.height / pr) + 'px'
        canvas.style.display = 'block'
        const wrap = document.createElement('div')
        wrap.style.cssText = 'position:relative;margin-bottom:2px;'
        const lbl = document.createElement('div')
        lbl.style.cssText = 'position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.4);color:#fff;font-size:10px;padding:2px 7px;border-radius:4px;font-family:Inter,sans-serif;pointer-events:none;z-index:2;'
        lbl.textContent = `${i} / ${pdf.numPages}`
        wrap.appendChild(canvas); wrap.appendChild(lbl)
        container.appendChild(wrap)
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
      } catch (err) { if (err?.name !== 'RenderingCancelledException') console.error(err) }
    }
    setScrollLoading(false)
  }, [])

  useEffect(() => { if (status === 'ready' && mode === 'page') renderPage(pageNum) }, [status, pageNum, mode, renderPage])
  useEffect(() => {
    if (status !== 'ready' || mode !== 'scroll') return
    const t = setTimeout(() => renderAllPages(), 100)
    return () => clearTimeout(t)
  }, [status, mode, renderAllPages])

  useEffect(() => {
    if (status !== 'ready') return
    let timer
    const onResize = () => { clearTimeout(timer); timer = setTimeout(() => mode === 'page' ? renderPage(pageNum) : renderAllPages(), 300) }
    window.addEventListener('resize', onResize); window.addEventListener('orientationchange', onResize)
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); clearTimeout(timer) }
  }, [status, mode, pageNum, renderPage, renderAllPages])

  const goPrev = () => { if (pageNum > 1) setPageNum(p => p - 1) }
  const goNext = () => { if (pageNum < totalPages) setPageNum(p => p + 1) }
  const close = () => navigate(`/book/${id}`)
  const toggleMode = () => setMode(m => m === 'page' ? 'scroll' : 'page')

  const center = { display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,padding:32,textAlign:'center',flex:1 }

  if (status === 'loading') return <div className="reader-overlay"><div style={center}><div style={{fontSize:40}}>📖</div><p style={{color:'var(--ink2)',fontSize:16}}>Loading book…</p></div></div>
  if (status === 'denied') return <div className="reader-overlay"><div style={center}><div style={{fontSize:44}}>🔒</div><p style={{color:'var(--ink)',fontSize:17,fontWeight:700}}>Access restricted</p><p style={{color:'var(--ink2)',fontSize:14}}>Purchase this book to read it.</p><button className="btn btn-primary" onClick={() => navigate(`/book/${id}`)}>Go to book page</button></div></div>
  if (status === 'no-file') return <div className="reader-overlay"><div style={center}><div style={{fontSize:44}}>⚠️</div><p style={{color:'var(--ink)',fontSize:17,fontWeight:700}}>No file uploaded yet</p><button className="btn btn-secondary" onClick={close}>Go back</button></div></div>
  if (status === 'error') return <div className="reader-overlay"><div style={center}><div style={{fontSize:44}}>😕</div><p style={{color:'var(--danger)',fontSize:16,fontWeight:700}}>Something went wrong</p><p style={{color:'var(--ink2)',fontSize:13,maxWidth:300,lineHeight:1.6}}>{errorMsg}</p><div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center'}}><button className="btn btn-secondary" onClick={close}>Go back</button><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></div></div></div>

  return (
    <div className="reader-overlay">
      <div className="reader-header">
        <div className="reader-title">{book?.title}</div>
        <div className="reader-controls">
          <button className="action-btn" onClick={toggleMode}>{mode === 'page' ? '📜 Scroll' : '📄 Pages'}</button>
          {mode === 'page' && <>
            <button className="action-btn" onClick={goPrev} disabled={pageNum <= 1 || rendering}>‹</button>
            <span style={{fontSize:13,color:'var(--ink3)',minWidth:52,textAlign:'center'}}>{pageNum}/{totalPages}</span>
            <button className="action-btn" onClick={goNext} disabled={pageNum >= totalPages || rendering}>›</button>
          </>}
          <button className="action-btn" onClick={close}>✕</button>
        </div>
      </div>

      <div className="reader-body">
        {mode === 'page' && (
          <div className="pdf-container" ref={pageContainerRef}>
            {rendering && <div style={{position:'absolute',top:8,right:8,fontSize:11,color:'var(--ink3)',background:'var(--bg2)',padding:'3px 8px',borderRadius:4,zIndex:2}}>Rendering…</div>}
            <canvas ref={canvasRef} style={{display:'block'}} />
          </div>
        )}
        {mode === 'scroll' && (
          <div style={{width:'100%',maxWidth:750}}>
            {scrollLoading && <div style={{textAlign:'center',padding:'28px 0',color:'var(--ink2)',fontSize:14}}>📖 Loading all {totalPages} pages…</div>}
            <div ref={scrollContainerRef} style={{width:'100%',background:'#fff',borderRadius:8,overflow:'hidden',boxShadow:'0 2px 8px rgba(60,40,20,.08)'}} />
          </div>
        )}
      </div>

      {mode === 'page' && (
        <div className="reader-footer">
          <button className="reader-page-btn" onClick={goPrev} disabled={pageNum <= 1 || rendering}>‹</button>
          <span style={{fontSize:14,color:'var(--ink2)',fontWeight:600}}>{pageNum} of {totalPages}</span>
          <button className="reader-page-btn" onClick={goNext} disabled={pageNum >= totalPages || rendering}>›</button>
        </div>
      )}
    </div>
  )
}
