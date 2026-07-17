import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { VolumeSlider } from './VolumeSlider';

describe('VolumeSlider', () => {
  it('renders the current value as a percent', () => {
    const { getByRole } = render(<VolumeSlider value={0.65} onChange={() => {}} />);
    expect((getByRole('slider') as HTMLInputElement).value).toBe('65');
  });

  it('emits a unit value on change', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<VolumeSlider value={1} onChange={onChange} />);
    fireEvent.input(getByRole('slider'), { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledWith(0.4);
  });
});
