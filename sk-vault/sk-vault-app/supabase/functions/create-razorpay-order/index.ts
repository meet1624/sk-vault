// supabase/functions/create-razorpay-order/index.ts
//
// Creates a Razorpay "order" for a given book. This must happen
// server-side because it uses the Razorpay Key Secret, which should
// never be exposed in frontend code.
//
// Flow:
// 1. Frontend sends { book_id } along with the user's auth token.
// 2. We verify the user is logged in (via the auth token) and look up
//    the book's REAL price from our own database -- we never trust a
//    price sent from the frontend, since that could be tampered with.
// 3. We create a Razorpay order for that price and a 'pending' row in
//    our purchases table, then return the order details to the frontend.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID')!
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Client scoped to the calling user -- respects RLS, used to verify identity
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

    const { book_id } = await req.json()
    if (!book_id) {
      return new Response(JSON.stringify({ error: 'book_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service-role client to read the book's real price, bypassing RLS
    // (we trust our own server code here, not the frontend's claim)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: book, error: bookError } = await adminClient
      .from('books')
      .select('id, price_cents, discount_percent, is_free')
      .eq('id', book_id)
      .single()

    if (bookError || !book) {
      return new Response(JSON.stringify({ error: 'Book not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (book.is_free) {
      return new Response(JSON.stringify({ error: 'This book is free, no payment needed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const finalAmountCents = Math.round(book.price_cents * (1 - (book.discount_percent || 0) / 100))

    if (finalAmountCents <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid price' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Razorpay expects amount in the smallest currency unit (paise for INR),
    // which matches how we already store price_cents.
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`),
      },
      body: JSON.stringify({
        amount: finalAmountCents,
        currency: 'INR',
        notes: { book_id, user_id: user.id },
      }),
    })

    const razorpayOrder = await razorpayRes.json()

    if (!razorpayRes.ok) {
      console.error('Razorpay order creation failed:', razorpayOrder)
      return new Response(JSON.stringify({ error: 'Failed to create payment order' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Record a pending purchase row. If the user already has a pending
    // or completed row for this book, upsert avoids a duplicate-key error
    // (the purchases table has a unique(user_id, book_id) constraint).
    const { error: upsertError } = await adminClient
      .from('purchases')
      .upsert(
        {
          user_id: user.id,
          book_id,
          amount_paid_cents: finalAmountCents,
          razorpay_order_id: razorpayOrder.id,
          status: 'pending',
        },
        { onConflict: 'user_id,book_id' }
      )

    if (upsertError) {
      console.error('Failed to record pending purchase:', upsertError)
      return new Response(JSON.stringify({ error: 'Failed to record purchase' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        order_id: razorpayOrder.id,
        amount: finalAmountCents,
        currency: 'INR',
        key_id: RAZORPAY_KEY_ID,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
