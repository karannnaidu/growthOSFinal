'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Artifact {
  id: string;
  name: string;
  properties: {
    type: string;
    content: unknown;
    status: 'draft' | 'approved';
    question?: string;
    product_ref?: string;
  };
}

export function NovaArtifactReview({ brandId }: { brandId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('knowledge_nodes')
        .select('id, name, properties')
        .eq('brand_id', brandId)
        .eq('node_type', 'ai_artifact')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        setArtifacts((data ?? []) as Artifact[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, supabase]);

  const approve = async (id: string) => {
    const res = await fetch(`/api/ai-artifacts/${id}/approve`, { method: 'POST' });
    if (res.ok) {
      setArtifacts(prev =>
        prev.map(a =>
          a.id === id
            ? { ...a, properties: { ...a.properties, status: 'approved' } }
            : a,
        ),
      );
    }
  };

  const copy = async (content: unknown) => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await navigator.clipboard.writeText(text);
  };

  if (loading) return <div className="text-xs text-muted-foreground">Loading artifacts…</div>;
  if (artifacts.length === 0) return (
    <div className="text-xs text-muted-foreground">
      No artifacts yet. Run the AI Visibility Optimizer to generate drafts.
    </div>
  );

  return (
    <div className="space-y-2">
      {artifacts.map(a => (
        <div key={a.id} className="rounded-lg bg-white/[0.04] p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{a.properties.type}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                a.properties.status === 'approved'
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-yellow-500/20 text-yellow-300'
              }`}>
                {a.properties.status}
              </span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => copy(a.properties.content)}
                className="text-[10px] bg-white/[0.06] hover:bg-white/[0.12] rounded px-2 py-1"
              >
                Copy
              </button>
              {a.properties.status === 'draft' && (
                <button
                  onClick={() => approve(a.id)}
                  className="text-[10px] bg-[#7C3AED] hover:bg-[#7C3AED]/80 text-white rounded px-2 py-1"
                >
                  Approve
                </button>
              )}
            </div>
          </div>
          {a.properties.question && (
            <div className="text-[11px] text-muted-foreground/70 mb-1">
              Q: {a.properties.question}
            </div>
          )}
          <pre className="text-[10px] bg-black/30 rounded p-2 overflow-x-auto max-h-32">
            {typeof a.properties.content === 'string'
              ? a.properties.content.slice(0, 400)
              : JSON.stringify(a.properties.content, null, 2).slice(0, 400)}
          </pre>
        </div>
      ))}
    </div>
  );
}
