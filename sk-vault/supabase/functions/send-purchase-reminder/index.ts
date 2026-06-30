// supabase/functions/send-purchase-reminder/index.ts
//
// Sends a "complete your purchase" email to a user with a pending
// (unpaid) purchase. Only callable by an admin or editor — verified
// via the profiles table, same pattern used elsewhere in this project.
//
// Sends via Gmail SMTP using an App Password (free, no domain needed).
// Requires GMAIL_USER and GMAIL_APP_PASSWORD secrets to be set in the
// Supabase project's Edge Function secrets.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const GMAIL_USER = Deno.env.get('GMAIL_USER')!
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SITE_URL = Deno.env.get('SITE_URL') || 'https://sk-vault.netlify.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildEmailHtml({ userName, bookTitle, price, checkoutUrl }: {
  userName: string
  bookTitle: string
  price: string
  checkoutUrl: string
}) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #FAF7F2; padding: 32px 24px; border-radius: 12px;">
    <div style="text-align:center; margin-bottom: 24px;">
      <span style="display:inline-block; width:10px; height:10px; background:#B45309; border-radius:2px; margin-right:8px; vertical-align:middle;"></span>
      <span style="font-size:20px; font-weight:800; color:#1A1A1A; vertical-align:middle;">SK-Vault</span>
    </div>
    <h2 style="color:#1A1A1A; font-size:20px; margin-bottom:12px;">Hi ${userName || 'there'},</h2>
    <p style="color:#444; font-size:15px; line-height:1.6;">
      We noticed you started purchasing <strong>${bookTitle}</strong> but the payment wasn't completed.
    </p>
    <p style="color:#444; font-size:15px; line-height:1.6;">
      Your spot is still reserved — just finish checkout below to get instant access to the book.
    </p>
    <div style="background:#fff; border:1px solid #DDD5C8; border-radius:10px; padding:18px; margin: 24px 0;">
      <div style="font-size:14px; color:#666; margin-bottom:4px;">Book</div>
      <div style="font-size:16px; font-weight:700; color:#1A1A1A; margin-bottom:12px;">${bookTitle}</div>
      <div style="font-size:14px; color:#666; margin-bottom:4px;">Amount due</div>
      <div style="font-size:18px; font-weight:800; color:#14532D;">${price}</div>
    </div>
    <div style="text-align:center; margin: 28px 0;">
      <a href="${checkoutUrl}" style="background:#14532D; color:#fff; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:700; font-size:15px; display:inline-block;">
        Complete your purchase
      </a>
    </div>
    <p style="color:#999; font-size:12px; line-height:1.6; text-align:center; margin-top:32px;">
      If you've changed your mind, no action is needed. This is a one-time reminder.
    </p>
  </div>`
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

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single()

    if (!callerProfile || !['admin', 'editor'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { purchase_id } = await req.json()
    if (!purchase_id) {
      return new Response(JSON.stringify({ error: 'purchase_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: purchase, error: purchaseError } = await adminClient
      .from('purchases')
      .select('id, status, amount_paid_cents, user_id, book_id, books(title), profiles(email, full_name)')
      .eq('id', purchase_id)
      .single()

    if (purchaseError || !purchase) {
      return new Response(JSON.stringify({ error: 'Purchase not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (purchase.status === 'completed') {
      return new Response(JSON.stringify({ error: 'This purchase is already completed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const buyerEmail = purchase.profiles?.email
    if (!buyerEmail) {
      return new Response(JSON.stringify({ error: 'Buyer has no email on file' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = buildEmailHtml({
      userName: purchase.profiles?.full_name || '',
      bookTitle: purchase.books?.title || 'your book',
      price: `₹${(purchase.amount_paid_cents / 100).toFixed(0)}`,
      checkoutUrl: `${SITE_URL}/book/${purchase.book_id}`,
    })

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: {
          username: GMAIL_USER,
          password: GMAIL_APP_PASSWORD,
        },
      },
    })

    try {
      await client.send({
        from: `SK-Vault <${GMAIL_USER}>`,
        to: buyerEmail,
        subject: `Complete your purchase — ${purchase.books?.title || 'SK-Vault'}`,
        content: 'auto',
        html,
      })
    } catch (smtpErr) {
      console.error('Gmail SMTP error:', smtpErr)
      return new Response(JSON.stringify({ error: 'Failed to send email via Gmail' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } finally {
      await client.close()
    }

    await adminClient
      .from('purchases')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', purchase_id)

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
