import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/app/App';
afterEach(() => { cleanup(); localStorage.clear(); });
it('edits and moves stable roster entries and supports eight players', async () => {
  const user = userEvent.setup(); render(<App/>);
  expect(screen.getAllByRole('textbox')).toHaveLength(4);
  await user.clear(screen.getByLabelText('Seat 1 name')); await user.type(screen.getByLabelText('Seat 1 name'), 'Alex');
  for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: '+ Add player' }));
  expect(screen.getAllByRole('textbox')).toHaveLength(8);
  await user.click(screen.getByLabelText('Move seat 1 down')); expect((screen.getByLabelText('Seat 2 name') as HTMLInputElement).value).toBe('Alex');
  await user.click(screen.getByLabelText('Remove seat 8')); expect(screen.getAllByRole('textbox')).toHaveLength(7);
  await user.click(screen.getByRole('button', { name: /Start game/ })); expect(screen.getByRole('button', { name: 'Next turn →' }).hasAttribute('disabled')).toBe(true);
});
