import { PRECON_GRADE_COLORS, PRECON_GRADE_LABELS, type PreConGrade } from '../../types';

interface Props {
  grade: PreConGrade | undefined | null;
  size?: 'sm' | 'md';
}

export default function PreConGradePill({ grade, size = 'sm' }: Props) {
  if (!grade) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-[#7A756E] bg-[#7A756E]/10 ${
          size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
        }`}
      >
        Ungraded
      </span>
    );
  }
  const color = PRECON_GRADE_COLORS[grade];
  const label = PRECON_GRADE_LABELS[grade];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${
        size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
      style={{ color, backgroundColor: `${color}1A` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
