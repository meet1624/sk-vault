import { supabase } from './supabaseClient'

// Price is stored as integer paise (cents) in the DB to avoid floating point bugs.
// price_cents = 29900 means ₹299.00
export function formatPrice(priceCents) {
  return `₹${(priceCents / 100).toFixed(0)}`
}

export function getDiscountedPrice(book) {
  if (book.is_free) return 0
  if (!book.discount_percent) return book.price_cents
  return Math.round(book.price_cents * (1 - book.discount_percent / 100))
}

export async function fetchBooks() {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}

export async function fetchBookById(id) {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('id', id)
    .single()
  return { data, error }
}

// Returns true/false for whether the current user has purchased this book
export async function hasUserPurchased(userId, bookId) {
  if (!userId) return false
  const { data, error } = await supabase
    .from('purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .eq('status', 'completed')
    .maybeSingle()
  if (error) {
    console.error('Error checking purchase:', error.message)
    return false
  }
  return !!data
}

// Fetch all completed purchases for a user (for the Library page)
export async function fetchUserPurchases(userId) {
  const { data, error } = await supabase
    .from('purchases')
    .select('book_id, books(*)')
    .eq('user_id', userId)
    .eq('status', 'completed')
  return { data, error }
}

// Generates a short-lived signed URL to read a book file from the private bucket.
// Only succeeds if the storage RLS policy allows it (free book, owned, or admin).
export async function getBookFileUrl(filePath) {
  const { data, error } = await supabase.storage
    .from('book-files')
    .createSignedUrl(filePath, 60 * 5) // valid for 5 minutes
  if (error) {
    return { url: null, error }
  }
  return { url: data.signedUrl, error: null }
}
