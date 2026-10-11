import { TrendingUp } from 'lucide-react';

/**
 * P2 (R40): one line of what real bookings say ("Booked 5× in the last 30 days"). Quiet ink, not
 * the warning tone — it is a fact, not an alarm. The api sends it only past its threshold.
 */
export function ProofLine({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-[12.5px] font-semibold text-ink2 ${className}`}>
      <TrendingUp aria-hidden className="size-3.5 shrink-0 text-primary" />
      {text}
    </p>
  );
}
