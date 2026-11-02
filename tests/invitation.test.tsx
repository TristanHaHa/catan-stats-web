import { afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvitePanel } from '../src/app/InvitePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('copies a working lobby URL and explains where to send it', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
  render(<InvitePanel code="ABCDEF123456" />);
  const invite = `${location.origin}${location.pathname}?room=ABCDEF123456`;
  await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
  expect(writeText).toHaveBeenCalledWith(invite);
  expect(screen.getByRole('status')).toHaveTextContent('Paste it into your group chat');
  expect(screen.getByLabelText('Invite link')).toHaveValue(invite);
});

it('selects the visible invite URL when clipboard access fails', async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
  render(<InvitePanel code="ABCDEF123456" />);
  await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
  const input = screen.getByLabelText('Invite link') as HTMLInputElement;
  expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(input.value.length);
  expect(screen.getByRole('status')).toHaveTextContent('copy and send it to your friends');
});

it('offers the native share sheet when supported', async () => {
  const user = userEvent.setup();
  const share = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  try {
    render(<InvitePanel code="ABCDEF123456" />);
    await user.click(screen.getByRole('button', { name: 'Share invite…' }));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${location.origin}${location.pathname}?room=ABCDEF123456` }),
    );
  } finally {
    Reflect.deleteProperty(navigator, 'share');
  }
});
