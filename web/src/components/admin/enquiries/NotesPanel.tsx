'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { adminRequest } from '@/lib/admin/client';
import { reportAdminError } from '@/lib/admin/errors';
import type { components } from '@/lib/api-types';

type Note = components['schemas']['EnquiryNoteOut'];

const NOTE_MAX = 2000;

/** `2026-09-22T06:14:00Z` → `22 Sep, 11:44 am` in IST — the owner's own clock. */
export function noteTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Mockup A7's append-only timeline. Status changes land here too — the api writes one in the
 * same transaction as the change — so calls and status moves read as a single history.
 *
 * `enquiry_notes` has no author column in v1 (single owner), so the signed-in name comes from
 * the session rather than from the row.
 */
export function NotesPanel({
  id,
  notes,
  ownerName,
}: {
  id: string;
  notes: Note[];
  ownerName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fieldId = useId();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await adminRequest(`/admin/enquiries/${id}/notes`, {
        method: 'POST',
        body: { body: trimmed },
      });
      setBody('');
      toast.success('Note added');
      startTransition(() => router.refresh());
    } catch (e) {
      reportAdminError(e, { router, pathname, fallback: 'Could not add the note' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3">
      {notes.length === 0 ? (
        <p className="text-sm text-mute">No notes yet.</p>
      ) : (
        <ol className="grid gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-card border border-line bg-bg2 p-3 text-sm">
              {n.body}
              <span className="mt-1 block text-xs text-mute">
                {ownerName} · {noteTime(n.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="grid gap-2">
        <label htmlFor={fieldId} className="text-xs font-bold text-mute">
          Add a note
        </label>
        <Textarea
          id={fieldId}
          rows={3}
          maxLength={NOTE_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What happened on the call?"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!body.trim() || saving}
            onClick={() => void submit()}
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
