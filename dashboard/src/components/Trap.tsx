/** The hidden field bots fill in and people never see (spam.ts). */
export function Trap({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="trap" aria-hidden="true">
      Website
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
