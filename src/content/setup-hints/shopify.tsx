export function ShopifyHint() {
  return (
    <div className="space-y-2">
      <p className="font-medium">Create a Shopify Custom App access token</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          In your Shopify admin, go to{' '}
          <strong>Settings &rarr; Apps and sales channels</strong>.
        </li>
        <li>
          Click <strong>Develop apps</strong> (enable if prompted), then{' '}
          <strong>Create an app</strong>. Name it <em>Growth OS</em>.
        </li>
        <li>
          Open <strong>Configuration</strong> and click{' '}
          <strong>Configure Admin API scopes</strong>. Enable:
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>
              <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">read_products</code>
            </li>
            <li>
              <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">read_orders</code>
            </li>
            <li>
              <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">read_customers</code>
            </li>
          </ul>
        </li>
        <li>
          Save, then click <strong>Install app</strong>.
        </li>
        <li>
          On the <strong>API credentials</strong> tab, reveal and copy the{' '}
          <strong>Admin API access token</strong> (starts with{' '}
          <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">shpat_</code>
          ). It is shown only once.
        </li>
      </ol>
    </div>
  );
}
