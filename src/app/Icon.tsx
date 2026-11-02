export type IconName =
  | 'lobby'
  | 'users'
  | 'link'
  | 'share'
  | 'arrow'
  | 'moon'
  | 'sun'
  | 'chart'
  | 'history'
  | 'dice'
  | 'device'
  | 'check';
const paths: Record<IconName, string> = {
  lobby: 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-8h6v8',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  link: 'M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  share: 'M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  moon: 'M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10Z',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4m0-12.8 1.4-1.4M4.2 19.8l1.4-1.4M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0',
  chart: 'M4 20V10m8 10V4m8 16v-7',
  history: 'M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7m2-5v6l4 2',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01',
  device: 'M5 3h14v14H5ZM9 21h6m-3-4v4',
  check: 'm5 12 4 4L19 6',
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
