import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { DonationFooter } from './DonationFooter';

describe('DonationFooter', () => {
  it('renders the trust line and an external donation link', () => {
    const { getByText, getByRole } = render(<DonationFooter donateUrl="https://ko-fi.com/tabtune" />);
    expect(getByText(/fully local/i)).toBeTruthy();
    const link = getByRole('link') as HTMLAnchorElement;
    expect(link.href).toBe('https://ko-fi.com/tabtune');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });
});
