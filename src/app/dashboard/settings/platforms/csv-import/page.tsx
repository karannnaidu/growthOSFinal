'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Entity = 'orders' | 'customers' | 'products';

interface UploadResult {
  ok?: boolean;
  rowCount?: number;
  parseErrors?: string[];
  error?: string;
}

const ENTITIES: { id: Entity; label: string; hint: string }[] = [
  { id: 'orders', label: 'Orders', hint: 'Shopify-like columns: name/order_id, email, total, currency, created_at' },
  { id: 'customers', label: 'Customers', hint: 'email, first_name, last_name, total_spent, orders_count' },
  { id: 'products', label: 'Products', hint: 'sku, title, price, inventory, tags' },
];

export default function CsvImportPage() {
  const [brandId, setBrandId] = useState<string | null>(null);
  const [entity, setEntity] = useState<Entity>('orders');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function loadBrand() {
      try {
        const res = await fetch('/api/brands/me');
        if (res.ok) {
          const data = await res.json();
          if (data.brandId) setBrandId(data.brandId);
        }
      } catch { /* noop */ }
    }
    loadBrand();
  }, []);

  async function upload() {
    if (!file || !brandId) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set('brandId', brandId);
      fd.set('entity', entity);
      fd.set('file', file);
      const res = await fetch('/api/onboarding/csv-import', {
        method: 'POST',
        body: fd,
      });
      const json = (await res.json()) as UploadResult;
      setResult(json);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'upload-failed' });
    } finally {
      setBusy(false);
    }
  }

  const entityMeta = ENTITIES.find((e) => e.id === entity)!;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">CSV Import</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Upload exports from Shopify / WooCommerce / any platform with similar columns.
        These back the <code>brand.*</code> resolvers when live OAuth is not connected.
      </p>

      <div className="flex gap-2 mb-4">
        {ENTITIES.map((e) => (
          <Button
            key={e.id}
            variant={entity === e.id ? 'default' : 'outline'}
            onClick={() => {
              setEntity(e.id);
              setResult(null);
              setFile(null);
            }}
          >
            {e.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload {entityMeta.label} CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-neutral-500">Recognised columns: {entityMeta.hint}</p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
          <Button onClick={upload} disabled={!file || !brandId || busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
          {!brandId && (
            <p className="text-xs text-amber-500">Loading brand…</p>
          )}
          {result && result.ok && (
            <div className="text-sm text-emerald-400">
              Imported <b>{result.rowCount}</b> rows.
              {result.parseErrors && result.parseErrors.length > 0 && (
                <ul className="mt-2 text-amber-400 list-disc list-inside">
                  {result.parseErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {result && result.error && (
            <div className="text-sm text-rose-400">Error: {result.error}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
