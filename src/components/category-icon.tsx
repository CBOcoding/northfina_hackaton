// A blue tile with a simple line drawing of the category: e-bike, laptop or farm machine.
import type { AssetCategory } from '@/data/schemas';

const paths: Record<AssetCategory, React.ReactNode> = {
  e_bike: (
    <>
      <circle cx="7" cy="17" r="3.5" />
      <circle cx="25" cy="17" r="3.5" />
      <path d="M7 17l5-8h9l4 8M12 9l4 8h5M18 6h4M11 6h3" />
    </>
  ),
  laptop: (
    <>
      <rect x="7" y="7" width="18" height="12" rx="1.5" />
      <path d="M4 23h24M13 23l1-2h4l1 2" />
    </>
  ),
  farm_machine: (
    <>
      <circle cx="9" cy="20" r="4.5" />
      <circle cx="24" cy="21.5" r="3" />
      <path d="M13.5 20H21M6 15V8h8l2 7h8v4M10 8V5" />
    </>
  ),
};

type Props = { category: AssetCategory; size?: 'md' | 'lg' };

export function CategoryIcon({ category, size = 'md' }: Props) {
  const box = size === 'lg' ? 'size-16 rounded-2xl p-3' : 'size-10 rounded-xl p-2';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 28"
      className={`${box} shrink-0 bg-linear-to-b from-emerald-500 to-emerald-700 text-white shadow-[0_8px_18px_-8px_rgb(10_68_250/0.6)]`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[category]}
    </svg>
  );
}
