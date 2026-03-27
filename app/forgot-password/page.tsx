'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // Ignore network errors — always show success to prevent enumeration
    }
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#2563EB] dark:text-[#3B82F6]">Jobbly</h1>
          <p className="mt-1 text-sm text-[#6B7280] dark:text-[#94A3B8]">by Omniside AI</p>
        </div>

        <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-[#E5E7EB] dark:border-[#334155] shadow-sm p-8">
          {submitted ? (
            <div className="text-center">
              <h2 className="text-lg font-semibold text-[#111827] dark:text-[#F1F5F9] mb-3">Check your email</h2>
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-6">
                If an account exists for <strong>{email}</strong>, we&apos;ve sent a password reset link. It expires in 1 hour.
              </p>
              <a href="/login" className="text-sm text-[#2563EB] dark:text-[#3B82F6] hover:underline">
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[#111827] dark:text-[#F1F5F9] mb-2">
                Reset your password
              </h2>
              <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] mb-6">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />

                {error && (
                  <p className="text-sm text-[#DC2626] bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <a href="/login" className="text-sm text-[#6B7280] dark:text-[#94A3B8] hover:text-[#2563EB] dark:hover:text-[#3B82F6] transition-colors">
                  Back to sign in
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
