'use client';

import {
  Backpack,
  Eye,
  Hourglass,
  IdCard,
  type LucideIcon,
  Star,
  Undo2,
  Wallet,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { adminRequest } from '@/lib/admin/client';
import {
  type EmailSettings,
  type EmailType,
  type EmailTypeSetting,
  emailPath,
} from '@/lib/admin/emails';
import { reportAdminError } from '@/lib/admin/errors';
import { cn } from '@/lib/utils';
import { EmailPreviewSheet } from './EmailPreviewSheet';

const ICON: Record<EmailType, LucideIcon> = {
  balance_reminder: Wallet,
  details_reminder: IdCard,
  trip_pack: Backpack,
  review_request: Star,
  still_thinking: Hourglass,
  refund: Undo2,
};

/** One card per automatic email: what it is, when it goes, its switch, preview and test. */
export function EmailSettingsBoard({ settings }: { settings: EmailSettings }) {
  const [open, setOpen] = useState<EmailTypeSetting | null>(null);
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Automatic emails">
        {settings.types.map((t) => (
          <EmailCard key={t.type} setting={t} onPreview={() => setOpen(t)} />
        ))}
      </ul>
      <EmailPreviewSheet
        setting={open}
        ownerEmail={settings.ownerEmail ?? null}
        onOpenChange={(o) => !o && setOpen(null)}
      />
    </>
  );
}

function EmailCard({
  setting: t,
  onPreview,
}: {
  setting: EmailTypeSetting;
  onPreview: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(t.on);
  const Icon = ICON[t.type];
  const toggle = (next: boolean) =>
    start(async () => {
      setOn(next);
      try {
        await adminRequest(emailPath(t.type), { method: 'PUT', body: { on: next } });
        toast.success(
          next ? `${t.label}: on` : `${t.label}: off — none will go until you switch it back`,
        );
        router.refresh();
      } catch (e) {
        setOn(!next);
        reportAdminError(e, { router, pathname, fallback: 'Could not change the switch' });
      }
    });
  return (
    <li
      className={cn(
        'grid gap-3 rounded-card border border-line bg-bg p-4 transition-opacity',
        !on && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-[12px]',
            on ? 'bg-primary-soft text-primary-ink' : 'bg-bg2 text-mute',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-extrabold">{t.label}</h2>
          <p className="text-sm text-ink2">{t.trigger}</p>
        </div>
        {t.switchable ? (
          <Switch
            checked={on}
            disabled={pending}
            aria-label={`${t.label} on`}
            onCheckedChange={toggle}
          />
        ) : (
          <span className="rounded-chip bg-bg2 px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-mute">
            Always on
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="num font-bold text-ink">{t.recentSent}</span>
        <span className="text-mute">sent in the last 30 days</span>
        {t.unsubscribable && (
          <span className="rounded-chip border border-line px-2 py-0.5 text-[12px] font-semibold text-mute">
            Has an unsubscribe link
          </span>
        )}
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={onPreview}>
          <Eye className="size-4" aria-hidden />
          Preview
        </Button>
      </div>
    </li>
  );
}
