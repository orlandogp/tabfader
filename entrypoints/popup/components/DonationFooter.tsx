interface Props {
  donateUrl: string;
  /** Repository URL. Without it, "Open source" stays plain text. */
  repoUrl?: string;
}

export function DonationFooter({ donateUrl, repoUrl }: Props) {
  return (
    <footer class="footer">
      <div class="trust">
        🔒 Fully local · No data collection ·{' '}
        {repoUrl ? (
          <a href={repoUrl} target="_blank" rel="noopener noreferrer">
            Open source
          </a>
        ) : (
          'Open source'
        )}
      </div>
      <a class="donate" href={donateUrl} target="_blank" rel="noopener noreferrer">
        ☕ Buy me a coffee
      </a>
    </footer>
  );
}
