import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { TabRow } from './TabRow';
import type { AudibleTab } from '@/lib/types';

const tab: AudibleTab = { id: 1, title: 'Lofi', url: 'https://youtube.com', origin: 'youtube.com', muted: false, audible: true };

function renderRow(overrides: Partial<AudibleTab> = {}, handlers: { onToggleMute?: () => void; onUnlock?: () => void } = {}) {
  return render(
    <TabRow
      tab={{ ...tab, ...overrides }}
      granted={false}
      volume={1}
      onToggleMute={handlers.onToggleMute ?? (() => {})}
      onUnlock={handlers.onUnlock ?? (() => {})}
      onVolume={() => {}}
    />,
  );
}

describe('TabRow', () => {
  it('shows the unlock button when the site is not granted', () => {
    const onUnlock = vi.fn();
    const { getByText, queryByRole } = renderRow({}, { onUnlock });
    expect(queryByRole('slider')).toBeNull();
    fireEvent.click(getByText(/control volume/i));
    expect(onUnlock).toHaveBeenCalled();
  });

  it('shows the slider when granted', () => {
    const { getByRole } = render(
      <TabRow tab={tab} granted={true} volume={0.5} onToggleMute={() => {}} onUnlock={() => {}} onVolume={() => {}} />,
    );
    expect(getByRole('slider')).toBeTruthy();
  });

  it('names the mute button after the tab, so rows are distinguishable', () => {
    const onToggleMute = vi.fn();
    const { getByRole } = renderRow({}, { onToggleMute });
    fireEvent.click(getByRole('button', { name: 'Mute Lofi' }));
    expect(onToggleMute).toHaveBeenCalled();
  });

  it('offers Unmute <title> on a muted tab', () => {
    const { getByRole } = renderRow({ muted: true });
    expect(getByRole('button', { name: 'Unmute Lofi' })).toBeTruthy();
  });

  it('dims a silent, unmuted row and says it is silent', () => {
    const { container, getByText } = renderRow({ audible: false });
    expect(container.querySelector('.tab-row')).toHaveClass('quiet');
    expect(getByText('youtube.com · silent')).toBeTruthy();
  });

  it('does not dim a row that is playing', () => {
    const { container, getByText } = renderRow({ audible: true });
    expect(container.querySelector('.tab-row')).not.toHaveClass('quiet');
    expect(getByText('youtube.com')).toBeTruthy();
  });

  it('labels a silent muted row as muted, not silent', () => {
    const { container, getByText } = renderRow({ audible: false, muted: true });
    expect(container.querySelector('.tab-row')).not.toHaveClass('quiet');
    expect(getByText('youtube.com · muted')).toBeTruthy();
  });
});
