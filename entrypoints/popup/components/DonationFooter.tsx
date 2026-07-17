interface Props {
  donateUrl: string;
}

export function DonationFooter({ donateUrl }: Props) {
  return (
    <footer class="footer">
      <div class="trust">🔒 Fully local · No data collection · Open source</div>
      <a class="donate" href={donateUrl} target="_blank" rel="noopener noreferrer">☕ Buy me a coffee</a>
    </footer>
  );
}
