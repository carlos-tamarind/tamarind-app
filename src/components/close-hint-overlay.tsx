export function CloseHintOverlay({
  intensity,
  label,
}: {
  intensity: number;
  label: string;
}) {
  if (intensity <= 0) return null;

  const blur = 2 + intensity * 10;
  const veil = 0.12 + intensity * 0.42;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: `color-mix(in oklab, var(--foreground) ${Math.round(veil * 100)}%, transparent)`,
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur}px)`,
        }}
      />
      <span className="relative rounded-md border bg-surface-raised px-3 py-1.5 text-sm font-medium text-foreground shadow-md">
        {label}
      </span>
    </div>
  );
}
