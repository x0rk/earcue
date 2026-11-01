import { useEffect, useRef, useState } from 'react';
import { Collapsible, Dialog as RDialog, DropdownMenu, Select as RSelect, Slider, Switch as RSwitch, ToggleGroup, Tooltip as RTooltip } from 'radix-ui';
import { Check, ChevronDown, X } from 'lucide-react';
import { setHint, toggleOpenMore, useStore } from '../store.js';
import { fmtNum } from '../lib/format.js';

const cx = (...c) => c.filter(Boolean).join(' ');

export const hintProps = (label, text) =>
  text
    ? {
        onPointerEnter: () => setHint({ label, text }),
        onPointerLeave: () => setHint(null),
        onFocusCapture: () => setHint({ label, text }),
        onBlurCapture: () => setHint(null),
      }
    : {};

// ---------- buttons ----------
const VARIANTS = {
  primary: 'bg-accent text-accent-ink hover:bg-accent/90',
  dark: 'bg-ink text-panel hover:bg-ink/85',
  secondary: 'bg-field text-ink hover:bg-field-hover',
  outline: 'border border-line-strong bg-panel text-ink hover:bg-panel-2',
  ghost: 'text-muted hover:bg-field hover:text-ink',
};
const SIZES = { sm: 'h-7 px-2.5 text-[12px]', md: 'h-8 px-3 text-[13px]', lg: 'h-9 px-4 text-[13px]', icon: 'h-8 w-8', iconSm: 'h-7 w-7' };

export function Button({ variant = 'secondary', size = 'md', className, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-line-strong bg-panel-2 px-1 font-mono text-[10.5px] text-muted">{children}</kbd>;
}

export function Tip({ label, shortcut, side = 'bottom', children }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="z-50 flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-[12px] text-panel shadow-pop animate-pop-in">
          {label}
          {shortcut && <span className="font-mono text-[11px] opacity-60">{shortcut}</span>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function IconButton({ label, shortcut, side, variant = 'ghost', size = 'icon', children, ...props }) {
  return (
    <Tip label={label} shortcut={shortcut} side={side}>
      <Button variant={variant} size={size} aria-label={label} {...props}>
        {children}
      </Button>
    </Tip>
  );
}

// ---------- scrub field ----------
// The main control: the whole row is a slider. Drag anywhere to change it, click the number to type.
const POSITIONS = 400;

export function Scrub({ label, value, onChange, onCommit, min, max, step = 1, log = false, digits = 0, unit = '', format, sub, hint, bipolar = false, disabled = false }) {
  const toPos = (v) => (log ? (Math.log(Math.max(v, min) / min) / Math.log(max / min)) * POSITIONS : ((v - min) / (max - min)) * POSITIONS);
  const fromPos = (p) => (log ? min * Math.pow(max / min, p / POSITIONS) : min + ((max - min) * p) / POSITIONS);
  const clamp = (v) => Math.min(max, Math.max(min, v));
  // Round to the step's own precision so saved values never carry float noise like 0.30000000000000004.
  const stepDigits = (String(step).split('.')[1] || '').length;
  const quant = (v) => Number((Math.round(v / step) * step).toFixed(stepDigits));
  const pos = Math.max(0, Math.min(POSITIONS, toPos(value)));
  const zero = bipolar ? Math.max(0, Math.min(POSITIONS, toPos(0))) : 0;
  const shown = format ? format(value) : fmtNum(value, digits);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const finishEdit = (keep) => {
    if (keep) {
      const v = parseFloat(draft);
      if (Number.isFinite(v)) {
        onChange(clamp(quant(v)));
        onCommit?.();
      }
    }
    setEditing(false);
  };

  return (
    <div className={cx('group relative h-8 rounded-[7px] bg-field transition-colors hover:bg-field-hover', disabled && 'pointer-events-none opacity-45')} {...hintProps(label, hint)}>
      <Slider.Root
        className="absolute inset-0 flex cursor-ew-resize touch-none select-none items-center"
        min={0}
        max={POSITIONS}
        step={1}
        value={[pos]}
        disabled={disabled}
        onValueChange={([p]) => onChange(clamp(quant(fromPos(p))))}
        onValueCommit={() => onCommit?.()}
      >
        <Slider.Track className="relative h-full w-full overflow-hidden rounded-[7px]">
          {/* The fill's leading edge is the indicator, so nothing sits on top of the label. */}
          <div
            className={cx(
              'absolute inset-y-0 bg-accent/15 transition-colors group-hover:bg-accent/22',
              pos >= zero ? 'border-r-2' : 'border-l-2',
              Math.abs(pos - zero) < 0.5 ? 'border-transparent' : 'border-accent',
            )}
            style={{ left: `${(Math.min(zero, pos) / POSITIONS) * 100}%`, width: `${(Math.abs(pos - zero) / POSITIONS) * 100}%` }}
          />
          {bipolar && <div className="absolute inset-y-2 w-px bg-line-strong" style={{ left: `${(zero / POSITIONS) * 100}%` }} />}
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          aria-valuetext={`${shown}${unit ? ` ${unit}` : ''}`}
          className="block h-5 w-[3px] rounded-full bg-accent opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </Slider.Root>
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[12.5px] text-muted transition-colors group-hover:text-ink">{label}</span>
      {editing ? (
        <input
          autoFocus
          aria-label={`${label} value`}
          className="absolute inset-y-1 right-1 w-[92px] rounded-[5px] bg-panel px-1.5 text-right font-mono text-[12px] text-ink outline-none ring-1 ring-accent"
          value={draft}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finishEdit(true);
            if (e.key === 'Escape') finishEdit(false);
          }}
          onBlur={() => finishEdit(true)}
        />
      ) : (
        <button
          type="button"
          tabIndex={-1}
          title="Click to type a value"
          className="absolute inset-y-1 right-1 flex items-center gap-1 rounded-[5px] px-1.5 font-mono text-[12px] text-ink tabular hover:bg-panel/80"
          onClick={() => {
            setDraft(fmtNum(value, Math.max(digits, step < 1 ? 2 : 0)));
            setEditing(true);
          }}
        >
          {sub && <span className="mr-1 text-faint">{sub(value)}</span>}
          <span>{shown}</span>
          {unit && <span className="text-muted">{unit}</span>}
        </button>
      )}
    </div>
  );
}

// ---------- segmented ----------
export function Segmented({ label, value, options, onChange, hint, size = 'md', stack = false }) {
  // Stacked puts the label above, giving four longer options the full panel width.
  return (
    <div className={cx('flex gap-2', stack ? 'flex-col gap-1.5' : 'items-center')} {...hintProps(label, hint)}>
      {label && <span className={cx('shrink-0 text-[12.5px] text-muted', !stack && 'w-[68px]')}>{label}</span>}
      <ToggleGroup.Root
        type="single"
        aria-label={label}
        value={String(value)}
        onValueChange={(v) => {
          if (!v) return;
          const opt = options.find((o) => String(o.value) === v);
          if (opt) onChange(opt.value);
        }}
        className="flex min-w-0 flex-1 gap-0.5 rounded-[7px] bg-field p-0.5"
      >
        {options.map((o) => (
          <ToggleGroup.Item
            key={String(o.value)}
            value={String(o.value)}
            title={o.title}
            className={cx(
              'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[5px] px-1.5 text-[12px] text-muted transition-colors hover:text-ink data-[state=on]:bg-panel data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--line-strong)]',
              size === 'sm' && 'h-6',
              size === 'md' && 'h-7',
              size === 'tall' && 'h-11 flex-col gap-0.5 px-0.5 text-[11.5px]',
            )}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}

// ---------- switch ----------
export function SwitchRow({ label, checked, onChange, hint }) {
  return (
    <label className="flex h-8 cursor-pointer items-center justify-between rounded-[7px] px-2.5 text-[12.5px] text-muted hover:bg-field hover:text-ink" {...hintProps(label, hint)}>
      {label}
      <RSwitch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-[18px] w-8 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-accent"
      >
        <RSwitch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-panel shadow transition-transform data-[state=checked]:translate-x-[16px]" />
      </RSwitch.Root>
    </label>
  );
}

// ---------- section with progressive disclosure ----------
export function Section({ id, title, action, children, more }) {
  const open = useStore((s) => !!s.openMore[id]);
  return (
    <section className="border-b border-line px-3 pb-3 pt-3">
      <div className="mb-2 flex min-h-6 items-center justify-between">
        <h3 className="text-[12px] font-semibold tracking-tight text-ink">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
      {more && (
        <Collapsible.Root open={open} onOpenChange={(v) => toggleOpenMore(id, v)}>
          <Collapsible.Content className="mt-1.5 flex flex-col gap-1.5">{more}</Collapsible.Content>
          <Collapsible.Trigger className="mt-2 inline-flex items-center gap-1 rounded px-1 text-[12px] text-muted hover:text-ink">
            {open ? 'Fewer options' : 'More options'}
            <ChevronDown className={cx('size-3.5 transition-transform', open && 'rotate-180')} />
          </Collapsible.Trigger>
        </Collapsible.Root>
      )}
    </section>
  );
}

// ---------- select ----------
export function Select({ value, onChange, groups, placeholder, label, className, size = 'md' }) {
  return (
    <RSelect.Root value={value} onValueChange={onChange}>
      <RSelect.Trigger
        aria-label={label}
        className={cx(
          'inline-flex min-w-0 items-center justify-between gap-2 rounded-lg bg-field px-2.5 text-ink hover:bg-field-hover data-[placeholder]:text-muted',
          size === 'sm' ? 'h-7 text-[12px]' : 'h-8 text-[13px]',
          className,
        )}
      >
        <span className="truncate">
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon>
          <ChevronDown className="size-3.5 text-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={6} className="z-50 max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line-strong bg-panel p-1 shadow-pop animate-pop-in">
          <RSelect.Viewport>
            {groups.map((g, gi) => (
              <RSelect.Group key={g.label || gi}>
                {g.label && <RSelect.Label className="px-2 pb-1 pt-2 text-[11px] font-medium text-faint">{g.label}</RSelect.Label>}
                {g.items.map((it) => (
                  <RSelect.Item
                    key={it.value}
                    value={it.value}
                    className="relative flex h-8 cursor-pointer select-none items-center rounded-md pl-7 pr-2 text-[13px] text-ink outline-none data-[highlighted]:bg-field"
                  >
                    <RSelect.ItemIndicator className="absolute left-2">
                      <Check className="size-3.5" />
                    </RSelect.ItemIndicator>
                    <RSelect.ItemText>{it.label}</RSelect.ItemText>
                  </RSelect.Item>
                ))}
              </RSelect.Group>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

// ---------- menu ----------
export function Menu({ trigger, items, align = 'end' }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className="z-50 min-w-[200px] rounded-xl border border-line-strong bg-panel p-1 shadow-pop animate-pop-in">
          {items.map((it, i) =>
            it === 'sep' ? (
              <DropdownMenu.Separator key={`sep-${i}`} className="my-1 h-px bg-line" />
            ) : (
              <DropdownMenu.Item
                key={it.label}
                disabled={it.disabled}
                onSelect={it.onSelect}
                className={cx(
                  'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-field [&_svg]:size-4',
                  it.danger ? 'text-hot' : 'text-ink',
                )}
              >
                {it.icon}
                <span className="flex flex-col">
                  <span>{it.label}</span>
                  {it.description && <span className="text-[11.5px] text-muted">{it.description}</span>}
                </span>
                {it.shortcut && <span className="ml-auto pl-4 font-mono text-[11px] text-faint">{it.shortcut}</span>}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ---------- dialog ----------
export function Dialog({ open, onOpenChange, title, description, children, width = 480, footer }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <RDialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop animate-pop-in"
          style={{ maxWidth: width }}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
            <div>
              <RDialog.Title className="text-[16px] font-semibold tracking-tight">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-[13px] text-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label="Close">
                <X />
              </Button>
            </RDialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 pb-5 pt-2">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-panel-2 px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

// Inline-editable text used for sound names in the top bar and lists.
export function EditableText({ value, onCommit, className, label, startEditing = false, onDone }) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const finish = (keep) => {
    if (keep && draft.trim() && draft !== value) onCommit(draft.trim());
    setEditing(false);
    onDone?.();
  };
  if (!editing) {
    return (
      <button type="button" className={cx('truncate rounded-md px-1.5 text-left hover:bg-field', className)} title="Click to rename" onClick={() => setEditing(true)}>
        {value}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      autoFocus
      aria-label={label}
      className={cx('rounded-md bg-panel px-1.5 outline-none ring-1 ring-accent', className)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
