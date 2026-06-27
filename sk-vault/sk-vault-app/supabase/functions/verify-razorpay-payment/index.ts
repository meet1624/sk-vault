// supabase/functions/verify-razorpay-payment/index.ts
//
// This is the function that actually decides whether a payment was real.
// Razorpay's checkout widget calls back to the frontend with a payment_id,
// order_id, and a signature. That signature is an HMAC-SHA256 hash of
// "order_id|payment_id" using the Key Secret. Only Razorpay and us (since
// we hold the secret) can produce a valid signature for given values --
// so if we recompute it here and it matches what was sent, the payment
// is provably real. If someone tried to fake a "successful payment" by
// calling this function with made-up values, the signatures simply
// wouldn't match and we'd reject it.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const user = userData.user

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, book_id } = await req.json()

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !book_id) {
      return new Response(JSON.stringify({ error: 'Missing required payment fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Recompute the expected signature ourselves -- this is the actual check.
    const expectedSignature = await hmacSha256Hex(
      RAZORPAY_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    )

    if (expectedSignature !== razorpay_signature) {
      console.warn('Signature mismatch for order:', razorpay_order_id)
      return new Response(JSON.stringify({ error: 'Payment verification failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Only update the row that matches this exact user, book, and order id.
    // This prevents one user's verified payment from being applied to
    // someone else's pending purchase row.
    const { data: updated, error: updateError } = await adminClient
      .from('purchases')
      .update({
        status: 'completed',
        razorpay_payment_id,
      })
      .eq('user_id', user.id)
      .eq('book_id', book_id)
      .eq('razorpay_order_id', razorpay_order_id)
      .select()
      .maybeSingle()

    if (updateError) {
      console.error('Failed to mark purchase completed:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to record completed purchase' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!updated) {
      return new Response(JSON.stringify({ error: 'No matching pending purchase found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
