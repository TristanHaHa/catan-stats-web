import { useEffect, useRef, useState } from 'react';
import type { Action } from '../domain/reducer';
import { createGame, elapsed, reducer, validRoster } from '../domain/reducer';
import type { Game, Player } from '../domain/types';
import { manualTotal, rollDice } from '../domain/dice';
import { duration, frequencies, playerStats } from '../domain/selectors';
import { KEY, SessionStorage } from '../storage/session';

const uid = () => crypto.randomUUID();
const palette = ['#bd563d','#327ca0','#d2a13a','#57774d','#9169a6','#bc6485'];
const player = (i: number): Player => ({ id: uid(), name: `Player ${i + 1}`, color: palette[i % palette.length] });
function boot() {
  try { const adapter = new SessionStorage(window.localStorage); try { return { adapter, game: adapter.load(), error: '', corrupt: false }; } catch { return { adapter, game: null, error: 'Saved data could not be read. It will be preserved until you explicitly discard it.', corrupt: adapter.blocked }; } }
  catch { return { adapter: null, game: null, error: 'Storage unavailable. Changes are not saved.', corrupt: false }; }
}
function Confirm({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => { previous?.focus(); }; }, []);
  const message = title === 'End game' ? 'Finish the active timed turn and keep the final statistics. Dice and turn controls will be locked.' : title === 'Reset game' ? 'Clear all rolls and times, keeping your players in the same order.' : title === 'New game' ? 'Discard this session and return to player setup with your current roster.' : 'Permanently remove the unreadable save from this browser.';
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); onCancel(); }} aria-labelledby="confirm-title"><h2 id="confirm-title">{title}?</h2><p>{message} This cannot be undone.</p><div className="actions"><button autoFocus onClick={onCancel}>Cancel</button><button className="danger" onClick={onConfirm}>Confirm {title.toLowerCase()}</button></div></dialog>;
}
export function App() {
  const [initial] = useState(boot);
  const [game, setGame] = useState<Game | null>(initial.game);
  const [roster, setRoster] = useState<Player[]>(() => initial.game?.players ?? Array.from({ length: 4 }, (_, i) => player(i)));
  const [saveError, setSaveError] = useState(initial.error);
  const [corrupt, setCorrupt] = useState(initial.corrupt);
  const [stale, setStale] = useState(false);
  const [selection, setSelection] = useState((initial.game?.rolls.length ?? 0) - 1);
  const [now, setNow] = useState(Date.now());
  const [manual, setManual] = useState('');
  const [entryError, setEntryError] = useState('');
  const [confirmation, setConfirmation] = useState<'Reset game' | 'End game' | 'New game' | 'Discard saved data' | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const listener = (e: StorageEvent) => { if ((e.key === KEY || e.key === null) && initial.adapter?.changed(e.newValue)) { setStale(true); setSaveError('Another tab changed this session. Reload to load its state; automatic saves are stopped.'); } }; window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener); }, [initial]);
  function commit(next: Game | null) {
    setGame(next); setNow(Date.now());
    try { if (!initial.adapter) throw new Error('Storage unavailable. Changes are not saved.'); initial.adapter.save(next); setSaveError(''); }
    catch (e) { setSaveError(`${e instanceof Error ? e.message : 'Storage write failed.'} Changes are not saved.`); if (initial.adapter?.blocked) setStale(true); }
  }
  function dispatch(action: Action) { if (!game) return; const next = reducer(game, action); if (next !== game) { commit(next); if (action.type === 'roll') setSelection(next.rolls.length - 1); if (action.type === 'reset') setSelection(-1); } }
  function record(total: number, dice: [number, number] | null = null) { if (!game?.activeTurn) return; dispatch({ type: 'roll', roll: { id: uid(), turnId: game.activeTurn.id, playerId: game.activeTurn.playerId, total, dice, source: dice ? 'generated' : 'manual', recordedAt: Date.now() } }); setEntryError(''); }
  function confirm() {
    if (confirmation === 'Discard saved data') { try { initial.adapter?.discard(); setCorrupt(false); setStale(false); setSaveError(''); } catch { setSaveError('Could not discard saved data. Storage is unavailable.'); } }
    else if (confirmation === 'Reset game') dispatch({ type: 'reset', id: uid(), turnId: uid() });
    else if (confirmation === 'End game') dispatch({ type: 'end', now: Date.now() });
    else if (confirmation === 'New game') { setRoster(game!.players); commit(null); setSelection(-1); }
    setConfirmation(null);
  }
  function move(id: string, step: number) { setRoster(current => { const next = [...current]; const from = next.findIndex(p => p.id === id); const to = from + step; if (to >= 0 && to < next.length) [next[from], next[to]] = [next[to], next[from]]; return next; }); }
  const active = game?.players.find(p => p.id === game.activeTurn?.playerId);
  const selected = game?.rolls[Math.max(0, Math.min(selection, game.rolls.length - 1))];
  const selectedSeat = game?.players.findIndex(p => p.id === selected?.playerId) ?? -1;
  const stats = game ? playerStats(game) : [];
  const histogram = game ? frequencies(game) : [];
  const maxCount = Math.max(1, ...histogram.map(f => f.count));
  const maxMean = Math.max(1, ...stats.map(p => p.meanMs ?? 0));
  return <><header><a className="brand" href="./"><span aria-hidden="true">⬡</span> CATAN <b>STATS</b></a><span className="tag">A little insight. A better game night.</span></header><main>
    <div className={saveError ? 'save warning' : 'save'} role="status">{saveError || (game ? 'Saved in this browser · No account needed' : 'Your game stays in this browser')}{stale && <button onClick={() => window.location.reload()}>Reload saved session</button>}</div>
    {corrupt ? <section className="panel"><h1>Your saved game needs attention</h1><p>The original save has not been overwritten. Discard it to start fresh.</p><button className="danger" onClick={() => setConfirmation('Discard saved data')}>Discard saved data</button></section> : !game ? <section className="setup panel"><p className="eyebrow">BEFORE THE FIRST ROLL</p><h1>Gather your players.</h1><p>Set your names and colors in turn order. There’s room for everyone.</p><form onSubmit={e => { e.preventDefault(); if (validRoster(roster)) { commit(createGame(roster, uid(), uid())); setSelection(-1); } }}>
      <div className="roster">{roster.map((p, i) => <div className="player-row" key={p.id}><span className="seat">{String(i + 1).padStart(2, '0')}</span><label className="name-label">Seat {i + 1} name<input required maxLength={40} value={p.name} onChange={e => setRoster(roster.map(v => v.id === p.id ? { ...v, name: e.target.value } : v))} /></label><label>Color<input aria-label={`Seat ${i + 1} color`} type="color" value={p.color} onChange={e => setRoster(roster.map(v => v.id === p.id ? { ...v, color: e.target.value } : v))} /></label><div className="row-actions"><button type="button" aria-label={`Move seat ${i + 1} up`} disabled={i === 0} onClick={() => move(p.id, -1)}>↑</button><button type="button" aria-label={`Move seat ${i + 1} down`} disabled={i === roster.length - 1} onClick={() => move(p.id, 1)}>↓</button><button type="button" aria-label={`Remove seat ${i + 1}`} disabled={roster.length <= 2} onClick={() => setRoster(roster.filter(v => v.id !== p.id))}>Remove</button></div></div>)}</div>
      <button type="button" className="add" onClick={() => setRoster([...roster, player(roster.length)])}>+ Add player</button><div className="setup-footer"><span>{roster.length} players · Names up to 40 characters</span><button className="primary" disabled={!validRoster(roster)}>Start game →</button></div></form></section> : <>
      <div className="page-heading"><div><p className="eyebrow">THE TABLE AT A GLANCE</p><h1>{game.phase === 'finished' ? 'That’s a wrap.' : 'Let the good rolls begin.'}</h1></div><span className="badge">{game.players.length} players · {game.completedTurns.length} completed turns</span></div>
      <div className="dashboard"><div className="controls"><section className="panel turn"><div className="section-heading"><h2>Current turn</h2><span className="badge">{game.phase}</span></div><div aria-live="polite" className="active-player"><i style={{ background: active?.color }} />{active ? `Seat ${game.players.indexOf(active) + 1} · ${active.name}` : 'Game finished'}</div><div className="timer" aria-label="Elapsed turn time">{duration(elapsed(game, now))}</div><p className="muted">{game.phase === 'ready' ? 'Ready when you are. Start the timer to begin.' : game.phase === 'finished' ? 'Final statistics are saved below.' : 'This turn · pauses excluded'}</p><div className="actions"><button className="primary" disabled={game.phase === 'finished'} onClick={() => dispatch({ type: game.phase === 'running' ? 'pause' : 'start', now: Date.now() })}>{game.phase === 'running' ? 'Pause timer' : game.phase === 'paused' ? 'Resume timer' : 'Start timer'}</button><button disabled={game.phase === 'ready' || game.phase === 'finished'} onClick={() => dispatch({ type: 'next', now: Date.now(), turnId: uid() })}>Next turn →</button></div></section>
      <section className="panel"><div className="section-heading"><h2>Dice & history</h2><span className="badge">{game.rolls.length} rolls</span></div><div className="roll-display" aria-live="polite"><strong>{selected?.total ?? '—'}</strong><span>{selected ? selected.dice ? `${selected.dice[0]} + ${selected.dice[1]} · two dice` : 'Manually recorded' : 'Your next story starts with a roll'}</span><small>{selected && `Seat ${selectedSeat + 1} · ${game.players[selectedSeat]?.name}`}</small></div><button className="primary full" disabled={game.phase === 'finished'} onClick={() => { const dice = rollDice(); record(dice[0] + dice[1], dice); }}>Roll dice</button><p className="muted">Or record the dice on your table</p><div className="quick">{histogram.map(f => <button key={f.total} disabled={game.phase === 'finished'} aria-label={`Record ${f.total}`} onClick={() => record(f.total)}>{f.total}</button>)}</div><form className="manual" onSubmit={e => { e.preventDefault(); const total = manualTotal(manual); if (total === null) setEntryError('Enter a whole number from 2 to 12.'); else { record(total); setManual(''); } }}><label htmlFor="manual">Manual total</label><div className="actions"><input id="manual" inputMode="numeric" value={manual} disabled={game.phase === 'finished'} aria-describedby={entryError ? 'entry-error' : undefined} onChange={e => setManual(e.target.value)} placeholder="2–12"/><button disabled={game.phase === 'finished'}>Record total</button></div>{entryError && <p id="entry-error" role="alert">{entryError}</p>}</form><nav className="history" aria-label="Roll history"><button disabled={selection <= 0} onClick={() => setSelection(selection - 1)}>Previous roll</button><span>{game.rolls.length ? `${selection + 1} / ${game.rolls.length}` : '0 / 0'}</span><button disabled={selection >= game.rolls.length - 1} onClick={() => setSelection(selection + 1)}>Next roll</button></nav></section></div>
      <div className="statistics"><section className="panel"><div className="section-heading"><h2>Every roll counts</h2><span className="badge">Roll frequency</span></div><p className="muted">The story of your dice, from 2 to 12.</p><div className="histogram" role="img" aria-label="Roll frequency chart; exact counts and percentages in the table below">{histogram.map(f => <div className="column" key={f.total}><span>{f.count}</span><div className="bar-space"><div className={f.total === 7 ? 'bar seven' : 'bar'} style={{ height: `${f.count / maxCount * 100}%` }}/></div><b>{f.total}</b></div>)}</div><details><summary>View counts & percentages</summary><table><thead><tr><th>Total</th><th>Count</th><th>Percent</th></tr></thead><tbody>{histogram.map(f => <tr key={f.total}><th>{f.total}</th><td>{f.count}</td><td>{f.percent.toFixed(1)}%</td></tr>)}</tbody></table></details></section>
      <section className="panel"><div className="section-heading"><h2>Time at the table</h2><span className="badge">Average turn</span></div><p className="muted">Completed turns only. Every player has their own pace.</p><div className="time-chart">{stats.map(p => <div key={p.id}><div className="time-label"><span>{p.seat}. {p.name}</span><b>{p.meanMs === null ? '—' : `${(p.meanMs / 1000).toFixed(1)}s`}</b></div><div className="track"><div style={{ background: p.color, width: `${(p.meanMs ?? 0) / maxMean * 100}%` }}/></div></div>)}</div><div className="table-wrap"><table><caption>Completed turn statistics</caption><thead><tr><th>Player</th><th>Turns</th><th>Total</th><th>Mean</th></tr></thead><tbody>{stats.map(p => <tr key={p.id}><th>{p.seat}. {p.name}</th><td>{p.count}</td><td>{duration(p.totalMs)}</td><td>{p.meanMs === null ? '—' : `${(p.meanMs / 1000).toFixed(1)}s`}</td></tr>)}</tbody></table></div></section></div></div>
      <footer className="session-actions"><span>Session controls</span><button disabled={game.phase === 'finished'} onClick={() => setConfirmation('End game')}>End game</button><button onClick={() => setConfirmation('Reset game')}>Reset game</button><button onClick={() => setConfirmation('New game')}>New game</button></footer></>}
      <details className="help"><summary>About saving & timing</summary><p>One session is stored locally in this browser and origin. Running time includes time while the tab is hidden or closed. Paused time stays unchanged. Manual system-clock changes can affect timing; backward time changes are clamped to zero. Use one tab to play. Setup edits are saved when you start a game.</p></details>
    </main>{confirmation && <Confirm title={confirmation} onCancel={() => setConfirmation(null)} onConfirm={confirm}/>}</>;
}
