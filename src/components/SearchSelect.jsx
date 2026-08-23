import { useState, useEffect, useRef, useMemo } from 'react';
import { IconSearch, IconChevDown, IconX } from '../icons';

// A type-to-filter picker for lists a native <select> cannot handle. With 79
// leads and growing, scrolling a dropdown to find one name is unusable, so this
// filters as you type and supports arrow keys plus Enter.
//
// options: [{ value, label, sub }]  sub is optional secondary text (phone, area)
export default function SearchSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Choose…',
  searchPlaceholder = 'Type to search…',
  emptyLabel = 'No matches',
  allowClear = true,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value)) || null;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return options;
    return options.filter(o =>
      `${o.label || ''} ${o.sub || ''}`.toLowerCase().includes(term));
  }, [options, q]);

  // Reset the highlight whenever the visible set changes, otherwise Enter can
  // pick a row that scrolled out of the filtered list.
  useEffect(() => { setActive(0); }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Focus the search box on open so typing works immediately.
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20); }, [open]);

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[active];
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(opt) {
    onChange?.(opt ? opt.value : '');
    setOpen(false);
    setQ('');
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) pick(filtered[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  const field = { width: '100%', boxSizing: 'border-box', border: '1px solid rgba(27,76,94,.18)', borderRadius: 9, padding: '9px 11px', fontSize: 13.5, color: 'var(--brand-primary)', fontFamily: 'inherit', background: '#fff', outline: 'none' };

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ ...field, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'var(--brand-primary)' : 'rgba(27,76,94,.45)' }}>
          {selected ? selected.label : placeholder}
        </span>
        {allowClear && selected && (
          <span role="button" tabIndex={0} aria-label="Clear"
            onClick={e => { e.stopPropagation(); pick(null); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); pick(null); } }}
            style={{ display: 'flex', color: 'rgba(27,76,94,.4)', flexShrink: 0 }}>
            <IconX size={13} />
          </span>
        )}
        <span style={{ display: 'flex', color: 'rgba(27,76,94,.45)', flexShrink: 0 }}><IconChevDown size={13} /></span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 5px)', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid rgba(27,76,94,.14)', borderRadius: 12, boxShadow: '0 14px 38px rgba(18,54,66,.18)', overflow: 'hidden' }}>
          <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid rgba(27,76,94,.08)' }}>
            <span style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'rgba(27,76,94,.4)', display: 'flex' }}><IconSearch size={14} /></span>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              style={{ ...field, padding: '8px 10px 8px 30px', fontSize: 13 }} />
          </div>

          <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '14px 10px', fontSize: 12.5, color: 'rgba(27,76,94,.5)' }}>{emptyLabel}</div>
            )}
            {filtered.map((o, i) => {
              const isActive = i === active;
              const isSel = String(o.value) === String(value);
              return (
                <button key={o.value} type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    background: isActive ? 'rgba(27,76,94,.07)' : 'transparent',
                    borderRadius: 8, padding: '8px 10px', marginBottom: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: isSel ? 800 : 600, color: 'var(--brand-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {o.sub && <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(27,76,94,.5)', marginTop: 1 }}>{o.sub}</span>}
                </button>
              );
            })}
          </div>

          {options.length > 12 && (
            <div style={{ padding: '7px 12px', borderTop: '1px solid rgba(27,76,94,.08)', fontSize: 11, color: 'rgba(27,76,94,.45)' }}>
              {filtered.length} of {options.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
