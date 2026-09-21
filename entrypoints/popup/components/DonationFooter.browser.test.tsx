import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { DonationFooter } from './DonationFooter';

describe('DonationFooter', () => {
  it('renders the trust line and an external donation link', () => {
    const { getByText, getByRole } = render(<DonationFooter donateUrl="https://buymeacoffee.com/x" />);
    expect(getByText(/fully local/i)).toBeTruthy();
    const link = getByRole('link', { name: /buy me a coffee/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://buymeacoffee.com/x');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('links "Open source" to the repository when a repo url is given', () => {
    const { getByRole } = render(
      <DonationFooter donateUrl="https://buymeacoffee.com/x" repoUrl="https://github.com/o/r" />,
    );
    const link = getByRole('link', { name: /open source/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/o/r');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('keeps "Open source" as plain text without a repo url', () => {
    const { getByText, queryByRole } = render(<DonationFooter donateUrl="https://buymeacoffee.com/x" />);
    expect(getByText(/open source/i)).toBeTruthy();
    expect(queryByRole('link', { name: /open source/i })).toBeNull();
  });
});
