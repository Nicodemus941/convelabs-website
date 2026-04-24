import React, { useEffect, useRef, useState } from 'react';

/**
 * DateOfBirthInput — masked MM / DD / YYYY trio.
 *
 * Why three fields and not a calendar? Calendars are designed for future
 * dates near today. DOB is a remembered number the patient can type in
 * 3 seconds. The calendar forces 3-5 taps and breaks autofill.
 *
 * Behaviors:
 *  - Numeric-only keyboard on mobile (inputMode="numeric")
 *  - Auto-advance on completion (2 → 2 → 4 digits)
 *  - Auto-fallback to prior field on Backspace from an empty cell
 *  - autoComplete="bday-*" so iOS / Android / password managers autofill
 *  - Emits ISO yyyy-mm-dd string via onChange only when complete + valid
 *  - Clears emitted value (empty string) while incomplete / invalid
 *
 * Accepts either:
 *   value — ISO yyyy-mm-dd string, OR empty for unset
 *   onChange — called with ISO yyyy-mm-dd string, or '' when cleared
 */
interface Props {
  value?: string | null;
  onChange: (iso: string) => void;
  disabled?: boolean;
  autoFocusFirst?: boolean;
  minYear?: number;    // default 1900
  maxYear?: number;    // default current year
  className?: string;
  error?: boolean;
  id?: string;
}

function parseIso(iso: string | null | undefined): { m: string; d: string; y: string } {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return { m: '', d: '', y: '' };
  const [y, m, d] = iso.slice(0, 10).split('-');
  return { m, d, y };
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const DateOfBirthInput: React.FC<Props> = ({
  value,
  onChange,
  disabled,
  autoFocusFirst,
  minYear = 1900,
  maxYear = new Date().getFullYear(),
  className = '',
  error = false,
  id,
}) => {
  const initial = parseIso(value);
  const [mm, setMm] = useState(initial.m);
  const [dd, setDd] = useState(initial.d);
  const [yyyy, setYyyy] = useState(initial.y);

  const mmRef = useRef<HTMLInputElement>(null);
  const ddRef = useRef<HTMLInputElement>(null);
  const yyRef = useRef<HTMLInputElement>(null);

  // Sync when parent value changes externally (e.g. saved-family-member select)
  useEffect(() => {
    const next = parseIso(value);
    if (next.m !== mm || next.d !== dd || next.y !== yyyy) {
      setMm(next.m);
      setDd(next.d);
      setYyyy(next.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (m: string, d: string, y: string) => {
    if (m.length === 2 && d.length === 2 && y.length === 4) {
      const mi = parseInt(m, 10);
      const di = parseInt(d, 10);
      const yi = parseInt(y, 10);
      if (yi >= minYear && yi <= maxYear && isValidDate(yi, mi, di)) {
        onChange(`${y}-${m}-${d}`);
        return;
      }
    }
    onChange('');
  };

  const handleMm = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 2);
    setMm(v);
    emit(v, dd, yyyy);
    if (v.length === 2) ddRef.current?.focus();
  };
  const handleDd = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 2);
    setDd(v);
    emit(mm, v, yyyy);
    if (v.length === 2) yyRef.current?.focus();
  };
  const handleYy = (raw: string) => {
    const v = raw.replace(/\D/g, '').slice(0, 4);
    setYyyy(v);
    emit(mm, dd, v);
  };

  // Backspace-to-previous-field when current cell empty
  const onKeyBackNav = (which: 'mm' | 'dd' | 'yy') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && (e.currentTarget.value === '')) {
      if (which === 'dd') { mmRef.current?.focus(); e.preventDefault(); }
      if (which === 'yy') { ddRef.current?.focus(); e.preventDefault(); }
    }
  };

  // Paste support — let patients paste "04/15/1985" into MM and auto-distribute
  const onPasteToAny = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    // Match common formats: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
    const usFmt = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    const isoFmt = text.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (usFmt) {
      e.preventDefault();
      const m = usFmt[1].padStart(2, '0');
      const d = usFmt[2].padStart(2, '0');
      const y = usFmt[3];
      setMm(m); setDd(d); setYyyy(y);
      emit(m, d, y);
      yyRef.current?.focus();
    } else if (isoFmt) {
      e.preventDefault();
      const y = isoFmt[1];
      const m = isoFmt[2].padStart(2, '0');
      const d = isoFmt[3].padStart(2, '0');
      setMm(m); setDd(d); setYyyy(y);
      emit(m, d, y);
      yyRef.current?.focus();
    }
  };

  const base = `bg-white border rounded-md px-2 py-2 text-base text-center font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/30 focus:border-[#B91C1C] disabled:bg-gray-50 disabled:text-gray-500 ${error ? 'border-red-400' : 'border-gray-300'}`;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5" id={id}>
        <input
          ref={mmRef}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="bday-month"
          placeholder="MM"
          aria-label="Birth month"
          value={mm}
          onChange={(e) => handleMm(e.target.value)}
          onKeyDown={onKeyBackNav('mm')}
          onPaste={onPasteToAny}
          disabled={disabled}
          autoFocus={autoFocusFirst}
          maxLength={2}
          className={`${base} w-14`}
        />
        <span className="text-gray-400 select-none">/</span>
        <input
          ref={ddRef}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="bday-day"
          placeholder="DD"
          aria-label="Birth day"
          value={dd}
          onChange={(e) => handleDd(e.target.value)}
          onKeyDown={onKeyBackNav('dd')}
          onPaste={onPasteToAny}
          disabled={disabled}
          maxLength={2}
          className={`${base} w-14`}
        />
        <span className="text-gray-400 select-none">/</span>
        <input
          ref={yyRef}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          autoComplete="bday-year"
          placeholder="YYYY"
          aria-label="Birth year"
          value={yyyy}
          onChange={(e) => handleYy(e.target.value)}
          onKeyDown={onKeyBackNav('yy')}
          onPaste={onPasteToAny}
          disabled={disabled}
          maxLength={4}
          className={`${base} w-20`}
        />
      </div>
      <p className="mt-1 text-[11px] text-gray-500">Example: 04 / 15 / 1985</p>
    </div>
  );
};

export default DateOfBirthInput;
