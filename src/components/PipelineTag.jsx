import { sectionStyle } from '../pipeline';

export default function PipelineTag({ stage }) {
  const s = sectionStyle(stage);
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 7px', borderRadius: 999,
    fontSize: 10.5, fontWeight: 800, whiteSpace: 'nowrap', color: s.color, background: `${s.color}16` }}>{s.label}</span>;
}
