export default function Slider(props: {
  value: number;
  max: number;
  step?: number;
  class?: string;
  onInput: (v: number) => void;
}) {
  const pct = () => (props.max > 0 ? Math.min(100, (props.value / props.max) * 100) : 0);
  return (
    <input
      type="range"
      min="0"
      max={props.max}
      step={props.step ?? 1}
      value={props.value}
      class={`slider ${props.class ?? ""}`}
      style={{ "--p": `${pct()}%` }}
      onInput={(e) => props.onInput(+e.currentTarget.value)}
    />
  );
}
