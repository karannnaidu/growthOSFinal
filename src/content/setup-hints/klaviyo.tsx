export function KlaviyoHint() {
  return (
    <div className="space-y-2">
      <p className="font-medium">Create a Klaviyo Private API Key</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Sign in at{' '}
          <a
            href="https://www.klaviyo.com/login"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            klaviyo.com
          </a>
          .
        </li>
        <li>
          Click your <strong>Account name</strong> (top right) and choose{' '}
          <strong>Settings</strong>.
        </li>
        <li>
          Open the <strong>API Keys</strong> tab, then click{' '}
          <strong>Create Private API Key</strong>.
        </li>
        <li>
          Give it a name (e.g. <em>Growth OS</em>) and grant{' '}
          <strong>read</strong> scopes for <strong>Profiles</strong>,{' '}
          <strong>Lists</strong>, and <strong>Flows</strong>.
        </li>
        <li>
          Copy the key (starts with{' '}
          <code className="rounded bg-neutral-200 px-1 py-0.5 text-xs">pk_</code>
          ) and paste it here. Klaviyo only shows it once.
        </li>
      </ol>
    </div>
  );
}
