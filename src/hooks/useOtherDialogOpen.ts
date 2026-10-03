import { useEffect, useState } from 'react';

/**
 * True while any Radix dialog (shadcn Dialog/Sheet/AlertDialog) is open.
 * Floating chat launchers use it to step aside: on phones they covered the
 * recording-consent "Sign & continue" button (owner report 2026-10-02).
 */
export function useOtherDialogOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    const check = () => setIsOpen(!!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    return () => mo.disconnect();
  }, []);
  return isOpen;
}
