import { supabase } from './supabaseClient'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Loads the Razorpay checkout.js script once, reusing it on repeat calls.
let razorpayScriptPromise = null
export function loadRazorpayScript() {
  if (razorpayScriptPromise) return razorpayScriptPromise
  razorpayScriptPromise = new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'))
    document.body.appendChild(script)
  })
  return razorpayScriptPromise
}

async function callEdgeFunction(name, body) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('You must be logged in.')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || 'Something went wrong')
  }
  return json
}

export async function createRazorpayOrder(bookId) {
  return callEdgeFunction('create-razorpay-order', { book_id: bookId })
}

export async function verifyRazorpayPayment(payload) {
  return callEdgeFunction('verify-razorpay-payment', payload)
}
