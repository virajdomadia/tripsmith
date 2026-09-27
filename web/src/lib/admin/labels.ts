import { istShortDate } from '@/components/admin/enquiries/ist-date';

/** `98450 22110` — how the desk and the inbox print an Indian mobile number. */
export const phoneLabel = (phone: string) => `${phone.slice(0, 5)} ${phone.slice(5)}`;

/** Received as a relative age up to a week old, then the calendar date ("12 min ago"). */
export function receivedLabel(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return istShortDate(iso);
}
