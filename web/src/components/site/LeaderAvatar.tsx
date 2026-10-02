import Image from 'next/image';
import { initialsOf, toneOf } from '@/lib/leaders';
import { cn } from '@/lib/utils';

type Leader = { slug: string; name: string; photoUrl?: string | null };

type Props = {
  leader: Leader;
  /** CSS pixels: about 24 on a departure row, 96 on the card, 160 on the leader's page. */
  size: number;
  className?: string;
  /** Decorative by default (the name is always printed beside it); pass a label when not. */
  label?: string;
  priority?: boolean;
};

/**
 * A trip leader's face (R41): their uploaded photo, or a monogram drawn from the slug and name —
 * a disc in one of six site colours with a faint mountain contour behind the initials. Made-up
 * demo leaders never get a real person's photo.
 */
export function LeaderAvatar({ leader, size, className, label, priority }: Props) {
  const box = cn('relative inline-block shrink-0 overflow-hidden rounded-full', className);
  const style = { width: size, height: size };
  if (leader.photoUrl) {
    return (
      <span className={cn(box, 'bg-bg2')} style={style}>
        <Image
          src={leader.photoUrl}
          alt={label ?? ''}
          fill
          sizes={`${size}px`}
          priority={priority}
          className="object-cover"
        />
      </span>
    );
  }
  const tone = toneOf(leader.slug);
  const letters = initialsOf(leader.name);
  // Small avatars drop the contour: at row size it would only read as noise.
  const detailed = size >= 40;
  return (
    <span className={box} style={style}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className="block"
      >
        <rect width="100" height="100" fill={tone.fill} />
        {detailed && (
          <g fill="none" stroke={tone.ink} strokeLinejoin="round" strokeLinecap="round">
            <path
              d="M-4 80 L18 58 L28 66 L46 44 L60 60 L70 52 L104 78"
              strokeWidth="2.2"
              opacity=".28"
            />
            <path d="M-4 90 L22 74 L38 82 L58 66 L78 78 L104 70" strokeWidth="1.6" opacity=".16" />
          </g>
        )}
        <text
          x="50"
          y="50"
          dy=".35em"
          textAnchor="middle"
          fill={tone.ink}
          fontSize={letters.length > 1 ? 38 : 44}
          fontWeight={800}
          letterSpacing="1"
          style={{ fontFamily: 'inherit' }}
        >
          {letters}
        </text>
      </svg>
    </span>
  );
}
