export function MetaHint() {
  return (
    <div className="space-y-2">
      <p className="font-medium">Find your Meta Ad Account ID</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Open{' '}
          <a
            href="https://business.facebook.com"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            business.facebook.com
          </a>{' '}
          and switch to the correct business.
        </li>
        <li>
          Click <strong>Business Settings</strong> (top right gear).
        </li>
        <li>
          In the left sidebar, expand <strong>Accounts</strong> and choose{' '}
          <strong>Ad Accounts</strong>.
        </li>
        <li>
          Select your ad account. The ID appears below the name as{' '}
          <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">act_123456789</code>
          . Copy the numeric portion (without <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">act_</code>).
        </li>
      </ol>
    </div>
  );
}
