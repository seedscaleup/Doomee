export function Logo({ size = 28, word = true, dark = false, inverse = false }: { size?: number; word?: boolean; dark?: boolean; inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`flex items-center justify-center font-extrabold ${inverse ? 'bg-ink text-brand' : 'bg-brand text-ink'}`}
        style={{ width: size, height: size, borderRadius: size * 0.28, fontSize: size * 0.58 }} aria-hidden="true">
        D
      </span>
      {word && <span className={`font-extrabold tracking-[0.06em] ${dark ? 'text-white' : 'text-ink'}`} style={{ fontSize: size * 0.66 }}>DOOMEE</span>}
    </span>
  );
}
