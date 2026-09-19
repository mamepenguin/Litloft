interface SkeletonProps {
  className?: string;
}

/** A placeholder box. Size and shape come from `className`. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      data-skeleton
      className={`animate-pulse rounded-lg bg-bg-elevated ${className}`}
    />
  );
}
