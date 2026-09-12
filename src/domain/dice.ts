export function rollDice(rng: () => number = Math.random): [number, number] {
  const die = () => { const n = rng(); if (n < 0 || n >= 1 || !Number.isFinite(n)) throw new Error('Invalid RNG'); return Math.floor(n * 6) + 1; };
  return [die(), die()];
}
export function manualTotal(value: string): number | null { return /^(?:[2-9]|1[0-2])$/.test(value.trim()) ? Number(value.trim()) : null; }
