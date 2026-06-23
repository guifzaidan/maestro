export function Topbar({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-7">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: "var(--muted-2)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
