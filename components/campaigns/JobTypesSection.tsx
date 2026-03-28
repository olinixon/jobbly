'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface JobType {
  id: string
  name: string
  durationMinutes: number
  sortOrder: number
}

interface Props {
  campaignId: string
  initialJobTypes: JobType[]
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function JobTypesSection({ campaignId, initialJobTypes }: Props) {
  const [jobTypes, setJobTypes] = useState<JobType[]>(initialJobTypes)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDuration, setEditDuration] = useState('')
  const [addName, setAddName] = useState('')
  const [addDuration, setAddDuration] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  function startEdit(jt: JobType) {
    setEditingId(jt.id)
    setEditName(jt.name)
    setEditDuration(String(jt.durationMinutes))
    setError('')
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editDuration) { setError('Name and duration are required.'); return }
    setSaving(id)
    setError('')
    const res = await fetch(`/api/campaigns/${campaignId}/job-types/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), durationMinutes: parseInt(editDuration) }),
    })
    setSaving(null)
    if (!res.ok) { setError('Save failed.'); return }
    const updated = await res.json()
    setJobTypes(prev => prev.map(jt => jt.id === id ? updated : jt))
    setEditingId(null)
  }

  async function deleteJobType(id: string) {
    setDeleting(id)
    setError('')
    const res = await fetch(`/api/campaigns/${campaignId}/job-types/${id}`, { method: 'DELETE' })
    setDeleting(null)
    if (!res.ok) { setError('Delete failed.'); return }
    setJobTypes(prev => prev.filter(jt => jt.id !== id))
  }

  async function addJobType() {
    if (!addName.trim() || !addDuration) { setError('Name and duration are required.'); return }
    setAdding(true)
    setError('')
    const res = await fetch(`/api/campaigns/${campaignId}/job-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName.trim(), durationMinutes: addDuration }),
    })
    setAdding(false)
    if (!res.ok) { setError('Failed to add job type.'); return }
    const created = await res.json()
    setJobTypes(prev => [...prev, created])
    setAddName('')
    setAddDuration('')
    setShowAddForm(false)
  }

  const inputCls = 'px-2 py-1.5 text-sm border border-[#E5E7EB] dark:border-[#334155] rounded-lg bg-white dark:bg-[#0F172A] text-[#111827] dark:text-[#F1F5F9] focus:outline-none focus:ring-2 focus:ring-[#2563EB]'

  return (
    <section className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-6 shadow-sm">
      <h2 className="font-semibold text-[#111827] dark:text-[#F1F5F9] mb-1">Job Types</h2>
      <p className="text-xs text-[#9CA3AF] dark:text-[#475569] mb-5">Job types determine booking slot duration. Used when uploading a quote.</p>

      <div className="space-y-2 mb-4">
        {jobTypes.length === 0 && (
          <p className="text-sm text-[#9CA3AF] dark:text-[#475569]">No job types yet. Add one below.</p>
        )}
        {jobTypes.map((jt) => (
          <div key={jt.id} className="flex items-center gap-3 p-3 bg-[#F9FAFB] dark:bg-[#0F172A] border border-[#E5E7EB] dark:border-[#334155] rounded-lg">
            {editingId === jt.id ? (
              <>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className={`flex-1 ${inputCls}`}
                  placeholder="Job type name"
                />
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={editDuration}
                  onChange={e => setEditDuration(e.target.value)}
                  className={`w-24 ${inputCls}`}
                  placeholder="Minutes"
                />
                <span className="text-xs text-[#9CA3AF] shrink-0">min</span>
                <Button onClick={() => saveEdit(jt.id)} disabled={saving === jt.id}>
                  {saving === jt.id ? 'Saving…' : 'Save'}
                </Button>
                <button
                  onClick={() => setEditingId(null)}
                  className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#111827] dark:text-[#F1F5F9]">{jt.name}</p>
                  <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">{formatDuration(jt.durationMinutes)}</p>
                </div>
                <button
                  onClick={() => startEdit(jt)}
                  className="text-xs text-[#2563EB] dark:text-[#3B82F6] hover:underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteJobType(jt.id)}
                  disabled={deleting === jt.id}
                  className="text-xs text-[#DC2626] hover:underline disabled:opacity-50"
                >
                  {deleting === jt.id ? 'Removing…' : 'Remove'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {showAddForm ? (
        <div className="flex items-center gap-3 p-3 bg-[#F0F7FF] dark:bg-[#1e3a5f]/20 border border-[#BFDBFE] dark:border-[#1e3a5f] rounded-lg">
          <input
            value={addName}
            onChange={e => setAddName(e.target.value)}
            className={`flex-1 ${inputCls}`}
            placeholder="e.g. Standard Gutter Clean"
          />
          <input
            type="number"
            min="15"
            step="15"
            value={addDuration}
            onChange={e => setAddDuration(e.target.value)}
            className={`w-24 ${inputCls}`}
            placeholder="120"
          />
          <span className="text-xs text-[#9CA3AF] shrink-0">min</span>
          <Button onClick={addJobType} disabled={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
          <button
            onClick={() => { setShowAddForm(false); setAddName(''); setAddDuration(''); setError('') }}
            className="text-xs text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setShowAddForm(true); setError('') }}
          className="text-sm text-[#2563EB] dark:text-[#3B82F6] hover:underline font-medium"
        >
          + Add job type
        </button>
      )}

      {error && <p className="mt-3 text-sm text-[#DC2626]">{error}</p>}
    </section>
  )
}
