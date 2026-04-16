export function GoogleAdsHint() {
  return (
    <div className="space-y-2">
      <p className="font-medium">Find your Google Ads Customer ID</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Sign in at{' '}
          <a
            href="https://ads.google.com"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            ads.google.com
          </a>
          .
        </li>
        <li>
          Your <strong>Customer ID</strong> is shown at the top of the page
          (next to your email), formatted like{' '}
          <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">123-456-7890</code>
          .
        </li>
        <li>
          Copy the number and{' '}
          <strong>strip the dashes</strong> when pasting &mdash; e.g.{' '}
          <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">1234567890</code>
          .
        </li>
        <li>
          If you manage multiple accounts, make sure you&apos;re viewing the
          correct one (not the MCC/manager account) before copying the ID.
        </li>
      </ol>
    </div>
  );
}
