'use client';

import { useState, type ReactNode } from 'react';

export type SetupHintPlatform = 'ga4' | 'meta' | 'klaviyo' | 'shopify' | 'google-ads';

interface Props {
  platform: SetupHintPlatform;
  label?: string;
  children: ReactNode;
}

export function SetupHint({ platform, label = 'Where do I find this?', children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-sm" data-setup-hint={platform}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-neutral-500 hover:text-neutral-800 underline-offset-2 hover:underline transition-colors"
      >
        {open ? 'Hide help' : label}
      </button>
      {open && (
        <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 p-3 text-neutral-800">
          {children}
        </div>
      )}
    </div>
  );
}
