import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { TabRow } from './TabRow';
import type { AudibleTab } from '@/lib/types';

const tab: AudibleTab = { id: 1, title: 'Lofi', url: 'https://youtube.com', origin: 'youtube.com', muted: false };

describe('TabRow', () => {
  it('shows the unlock button when the site is not granted', () => {
    const onUnlock = vi.fn();
    const { getByText, queryByRole } = render(
      <TabRow tab={tab} granted={false} volume={1} onToggleMute={() => {}} onUnlock={onUnlock} onVolume={() => {}} />,
    );
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

  it('fires onToggleMute when the mute button is clicked', () => {
    const onToggleMute = vi.fn();
    const { getByLabelText } = render(
      <TabRow tab={tab} granted={true} volume={1} onToggleMute={onToggleMute} onUnlock={() => {}} onVolume={() => {}} />,
    );
    fireEvent.click(getByLabelText(/^mute$/i));
    expect(onToggleMute).toHaveBeenCalled();
  });
});
