import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerLobby } from '../src/app/PlayerLobby';
import type { RoomConnection } from '../src/multiplayer/useRoom';
import { createGame } from '../src/domain/reducer';

afterEach(cleanup);
it('keeps a space while the host types a two-word name across live save acknowledgements', async () => {
  const user = userEvent.setup();
  const players = [
    { id: 'p0', name: 'Player 1', color: '#bb4938' },
    { id: 'p1', name: 'Player 2', color: '#3277a0' },
  ];
  const command = vi.fn().mockResolvedValue(true);
  const shared = {
    uid: 'host',
    members: [],
    room: { hostUid: 'host', seats: {}, started: false, game: createGame(players, 'game', 'turn') },
    busy: false,
    online: true,
    synced: true,
    pending: null,
    offset: 0,
    command,
  } as unknown as RoomConnection;
  const onDirtyChange = vi.fn();
  const props = { host: true, onDirtyChange, ask: vi.fn() };
  const { rerender } = render(<PlayerLobby shared={shared} {...props} />);
  const input = screen.getByLabelText('Seat 1 name') as HTMLInputElement;
  await user.clear(input);
  await user.type(input, 'Clara ');
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'roster',
        players: [
          { color: players[0].color, id: players[0].id, name: 'Clara' },
          { color: players[1].color, id: players[1].id, name: players[1].name },
        ],
      }),
    ),
  );
  const acknowledged = {
    ...shared,
    room: {
      ...shared.room!,
      game: {
        ...shared.room!.game,
        players: [
          { color: players[0].color, id: players[0].id, name: 'Clara' },
          { color: players[1].color, id: players[1].id, name: players[1].name },
        ],
      },
    },
  };
  rerender(<PlayerLobby shared={acknowledged} {...props} />);
  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  expect(input.value).toBe('Clara ');
  await user.type(input, 'Rose');
  await waitFor(() =>
    expect(command).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'roster',
        players: [{ ...players[0], name: 'Clara Rose' }, players[1]],
      }),
    ),
  );
  expect(input.value).toBe('Clara Rose');
});
