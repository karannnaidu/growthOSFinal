export function Ga4Hint() {
  return (
    <div className="space-y-2">
      <p className="font-medium">Find your GA4 Property ID</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Open{' '}
          <a
            href="https://analytics.google.com"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            analytics.google.com
          </a>
          .
        </li>
        <li>
          Click the <strong>Admin</strong> gear (bottom-left).
        </li>
        <li>
          In the <strong>Property</strong> column, click{' '}
          <strong>Property Details</strong>.
        </li>
        <li>
          Your <strong>Property ID</strong> is a 9-digit number at the top
          right.
        </li>
      </ol>
    </div>
  );
}
