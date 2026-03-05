interface LoadingSpinnerProps {
  /** Spinner diameter: sm=20px, md=32px, lg=48px */
  size?: 'sm' | 'md' | 'lg';
  /** Override wrapper classes (default centers with py-12) */
  className?: string;
}

const sizeClasses = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-[3px]',
} as const;

export default function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div className={className ?? 'flex items-center justify-center py-12'}>
      <div className={`animate-spin rounded-full border-tribe-green border-t-transparent ${sizeClasses[size]}`} />
    </div>
  );
}
