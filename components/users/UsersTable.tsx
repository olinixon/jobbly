'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatDateTime } from '@/lib/formatDate'

interface User {
  id: string
  name: string
  email: string
  role: string
  campaignId: string | null
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
  campaign: { name: string } | null
  customer_payment_profile: { id: string; is_active: boolean; verified: boolean } | null
}

interface Campaign {
  id: string
  name: string
}

interface UsersTableProps {
  users: User[]
  campaigns: Campaign[]
  currentUserId: string
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'CLIENT', label: 'Client View' },
  { value: 'SUBCONTRACTOR', label: 'Subcontractor' },
]

const emptyForm = { name: '', email: '', password: '', role: 'CLIENT', campaignId: '' }

export default function UsersTable({ users, campaigns, currentUserId }: UsersTableProps) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ msg: string; warn?: boolean } | null>(null)
  const [invoicingActive, setInvoicingActive] = useState(false)
  const [invoicingLoading, setInvoicingLoading] = useState(false)

  function showToast(msg: string, warn = false) {
    setToast({ msg, warn })
    setTimeout(() => setToast(null), 5000)
  }

  const campaignOptions = [
    { value: '', label: '— None (Admin only) —' },
    ...campaigns.map((c) => ({ value: c.id, label: c.name })),
  ]

  function openAdd() {
    setEditUser(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(user: User) {
    setEditUser(user)
    setForm({ name: user.name, email: user.email, password: '', role: user.role, campaignId: user.campaignId ?? '' })
    setInvoicingActive(user.customer_payment_profile?.is_active ?? false)
    setError('')
    setShowModal(true)
  }

  async function toggleInvoicing(userId: string, active: boolean) {
    setInvoicingLoading(true)
    const res = await fetch(`/api/users/${userId}/active-invoicing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    const data = await res.json()
    setInvoicingLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to update invoicing status.')
      return
    }
    setInvoicingActive(active)
    if (data.warning) showToast(data.warning, true)
    router.refresh()
  }

  async function save() {
    setSaving(true)
    setError('')
    const url = editUser ? `/api/users/${editUser.id}` : '/api/users'
    const method = editUser ? 'PATCH' : 'POST'
    const body = { ...form, campaignId: form.campaignId || null }
    if (editUser && !form.password) delete (body as { password?: string }).password

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.')
      return
    }
    setShowModal(false)
    if (!editUser) {
      if (data.warning) showToast(`User created — ${data.warning}`, true)
      else showToast(`User created — welcome email sent to ${data.email}`)
    }
    router.refresh()
  }

  async function toggleActive(user: User) {
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    router.refresh()
  }

  async function deleteUser(user: User) {
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error)
      return
    }
    router.refresh()
  }

  return (
    <>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${toast.warn ? 'bg-amber-500' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}
      <div className="flex justify-end mb-4">
        <Button onClick={openAdd}>+ Add User</Button>
      </div>

      <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] dark:border-[#334155]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Campaign</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-[#94A3B8] uppercase tracking-wide">Last Login</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-[#F3F4F6] dark:border-[#0F172A] hover:bg-[#F9FAFB] dark:hover:bg-[#0F172A] transition-colors">
                  <td className="px-4 py-3 font-medium text-[#111827] dark:text-[#F1F5F9]">
                    <span className="flex items-center gap-2">
                      {user.name}
                      {user.role === 'CLIENT' && user.customer_payment_profile?.is_active && (
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-600 text-white">Active</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8]">{user.email}</td>
                  <td className="px-4 py-3"><Badge status={user.role} type="role" /></td>
                  <td className="px-4 py-3 text-[#6B7280] dark:text-[#94A3B8] text-xs">{user.campaign?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#6B7280] dark:text-[#94A3B8]">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(user)}>Edit</Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleActive(user)}
                        disabled={user.id === currentUserId}
                      >
                        {user.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => deleteUser(user)}
                        disabled={user.id === currentUserId}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editUser ? 'Edit User' : 'Add User'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input
              label={editUser ? 'New Password (leave blank to keep)' : 'Password'}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!editUser}
            />
            <Select
              label="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              options={ROLE_OPTIONS}
            />
            {form.role !== 'ADMIN' && (
              <Select
                label="Campaign"
                value={form.campaignId}
                onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
                options={campaignOptions}
              />
            )}
            {editUser && (form.role === 'CLIENT') && (
              <div className="border-t border-[#E5E7EB] dark:border-[#334155] pt-4">
                <p className="text-sm font-semibold text-[#374151] dark:text-[#CBD5E1] mb-3">Invoicing</p>
                {editUser.customer_payment_profile ? (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={invoicingActive}
                      disabled={invoicingLoading}
                      onClick={() => toggleInvoicing(editUser.id, !invoicingActive)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none mt-0.5 ${invoicingLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${invoicingActive ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${invoicingActive ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-sm">
                      <span className="font-medium text-[#111827] dark:text-[#F1F5F9]">Active invoicing account</span>
                      <br />
                      <span className="text-[#6B7280] dark:text-[#94A3B8] text-xs">This client&apos;s payment credentials will be used for all invoicing on this campaign.</span>
                    </span>
                  </label>
                ) : (
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled
                      className="relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent bg-gray-200 dark:bg-gray-700 cursor-not-allowed opacity-50 mt-0.5"
                    >
                      <span className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 translate-x-0" />
                    </button>
                    <span className="text-sm">
                      <span className="font-medium text-[#111827] dark:text-[#F1F5F9]">Active invoicing account</span>
                      <br />
                      <span className="text-[#9CA3AF] dark:text-[#475569] text-xs">This user has not connected a payment platform yet.</span>
                    </span>
                  </div>
                )}
              </div>
            )}
            {error && <p className="text-sm text-[#DC2626]">{error}</p>}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editUser ? 'Save Changes' : 'Add User'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
