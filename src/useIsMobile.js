import { useState, useEffect } from 'react';

// Single source of truth for the mobile breakpoint. Phones (and narrow windows)
// get the stacked, WhatsApp-style single-pane layout; everything wider keeps the
// multi-pane desktop layout.
export function useIsMobile(breakpoint = 760) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return isMobile;
}
