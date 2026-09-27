'use client';

import { useState } from 'react';
import { control } from '@/components/site/enquiry/Field';
import { cn } from '@/lib/utils';

/** The password with Show / Hide and a Caps Lock hint. A plain input inside the POST form. */
export function PasswordInput({ defaultValue }: { defaultValue: string }) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const check = (e: React.KeyboardEvent<HTMLInputElement>) =>
    setCaps(e.getModifierState?.('CapsLock') ?? false);
  return (
    <>
      <span className="relative block">
        <input
          id="password"
          name="password"
          type={shown ? 'text' : 'password'}
          autoComplete="current-password"
          required
          defaultValue={defaultValue}
          onKeyUp={check}
          onKeyDown={check}
          aria-describedby={caps ? 'password-caps' : undefined}
          className={cn(control, 'pr-16')}
        />
        <button
          type="button"
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-controls="password"
          onClick={() => setShown(!shown)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-[12.5px] font-bold text-primary hover:bg-primary-soft"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </span>
      {caps && (
        <span id="password-caps" className="text-[12.5px] font-semibold text-warn">
          Caps Lock is on.
        </span>
      )}
    </>
  );
}
