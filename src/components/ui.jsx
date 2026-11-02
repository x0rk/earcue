import { useEffect, useId, useRef, useState } from 'react';
import { Collapsible, ContextMenu as RContextMenu, Dialog as RDialog, DropdownMenu, Select as RSelect, Slider, Switch as RSwitch, ToggleGroup, Tooltip as RTooltip } from 'radix-ui';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { clip, oneLine } from '../engine/model.js';
import { commit, setHint, toggleOpenMore, useStore } from '../store.js';
import { fmtNum } from '../lib/format.js';
import { keyLabel } from '../lib/keys.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// The help strip shows hints to pointer and sighted keyboard users; screen readers get the same
// text as the control's description instead of a live region that talks on every focus change.
function HintText({ id, text }) {
  return text ? (
    <span id={id} hidden>
      {text}
    </span>
  ) : null;
}

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
  danger: 'bg-hot text-panel hover:bg-hot/90',
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
  return <kbd className="rounded border border-line-strong bg-panel-2 px-1 font-mono text-[10.5px] text-muted">{typeof children === 'string' ? keyLabel(children) : children}</kbd>;
}

export function Tip({ label, shortcut, side = 'bottom', children }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="z-50 flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-[12px] text-panel shadow-pop animate-pop-in">
          {label}
          {shortcut && <span className="font-mono text-[11px] opacity-75">{keyLabel(shortcut)}</span>}
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
  // A word like "Off" stands on its own, without "dB" or "cents" after it.
  const shownUnit = unit && /\d/.test(shown) ? unit : '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const thumb = useRef(null);
  const hintId = useId();

  const startEdit = () => {
    setDraft(fmtNum(value, Math.max(digits, step < 1 ? 2 : 0)));
    setEditing(true);
  };
  const finishEdit = (keep, refocus) => {
    if (keep) {
      const v = parseFloat(draft);
      if (Number.isFinite(v)) {
        onChange(clamp(quant(v)));
        onCommit?.();
      }
    }
    setEditing(false);
    if (refocus) requestAnimationFrame(() => thumb.current?.focus());
  };

  return (
    <div
      className={cx(
        'group relative h-8 rounded-[7px] bg-field transition-colors hover:bg-field-hover has-[[role=slider]:focus-visible]:outline-2 has-[[role=slider]:focus-visible]:outline-offset-1 has-[[role=slider]:focus-visible]:outline-accent',
        disabled && 'pointer-events-none opacity-45',
      )}
      {...hintProps(label, hint)}
    >
      <Slider.Root
        className="absolute inset-0 flex cursor-ew-resize touch-none select-none items-center"
        min={0}
        max={POSITIONS}
        step={1}
        value={[pos]}
        disabled={disabled}
        onValueChange={([p]) => onChange(clamp(quant(fromPos(p))))}
        // Radix commits keyboard steps before it reports the new value, so wait for the change.
        onValueCommit={() => queueMicrotask(() => onCommit?.())}
      >
        <Slider.Track className="relative h-full w-full overflow-hidden rounded-[7px]">
          <div
            className="absolute inset-y-0 bg-accent/15 transition-colors group-hover:bg-accent/22"
            style={{ left: `${(Math.min(zero, pos) / POSITIONS) * 100}%`, width: `${(Math.abs(pos - zero) / POSITIONS) * 100}%` }}
          />
          {/* Edge marks only at the top and bottom, so no line runs through the label or the value. */}
          {bipolar && <div className="absolute inset-y-0 w-px bg-[linear-gradient(to_bottom,var(--line-strong)_0_22%,transparent_22%_78%,var(--line-strong)_78%)]" style={{ left: `${(zero / POSITIONS) * 100}%` }} />}
          {Math.abs(pos - zero) >= 0.5 && (
            <div
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-[linear-gradient(to_bottom,var(--accent)_0_22%,transparent_22%_78%,var(--accent)_78%)]"
              style={{ left: `${(pos / POSITIONS) * 100}%` }}
            />
          )}
        </Slider.Track>
        <Slider.Thumb
          ref={thumb}
          aria-label={label}
          aria-valuetext={`${shown}${shownUnit ? ` ${shownUnit}` : ''}`}
          aria-describedby={hint ? hintId : undefined}
          aria-keyshortcuts="Enter"
          className="block h-8 w-px opacity-0 outline-none"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            startEdit();
          }}
        />
      </Slider.Root>
      <HintText id={hintId} text={hint} />
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
            if (e.key === 'Enter') finishEdit(true, true);
            if (e.key === 'Escape') finishEdit(false, true);
          }}
          onBlur={() => finishEdit(true, false)}
        />
      ) : (
        <button
          type="button"
          tabIndex={-1}
          title="Click to type a value, or press Enter on the slider"
          className="absolute inset-y-1 right-1 flex items-center gap-1 rounded-[5px] px-1.5 font-mono text-[12px] text-ink tabular hover:bg-panel/80"
          onClick={startEdit}
        >
          {sub && <span className="mr-1 text-muted">{sub(value)}</span>}
          <span>{shown}</span>
          {shownUnit && <span className="text-muted">{shownUnit}</span>}
        </button>
      )}
    </div>
  );
}

// ---------- segmented ----------
export function Segmented({ label, value, options, onChange, hint, size = 'md', stack = false, hideLabel = false }) {
  const hintId = useId();
  // Stacked puts the label above, giving four longer options the full panel width.
  return (
    <div className={cx('flex gap-2', stack ? 'flex-col gap-1.5' : 'items-center')} {...hintProps(label, hint)}>
      {label && !hideLabel && <span className={cx('shrink-0 text-[12.5px] text-muted', !stack && 'w-[68px]')}>{label}</span>}
      <HintText id={hintId} text={hint} />
      <ToggleGroup.Root
        type="single"
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
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
              'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-[5px] px-1.5 text-[12px] text-muted transition-colors hover:text-ink data-[state=on]:bg-panel data-[state=on]:font-medium data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--faint)]',
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
  const hintId = useId();
  // The hint sits outside the label, or it would become part of the switch's name.
  return (
    <>
      <HintText id={hintId} text={hint} />
      <label className="flex h-8 items-center justify-between rounded-[7px] px-2.5 text-[12.5px] text-muted hover:bg-field hover:text-ink" {...hintProps(label, hint)}>
        {label}
        <RSwitch.Root
          checked={checked}
          onCheckedChange={onChange}
          aria-describedby={hint ? hintId : undefined}
          className="relative h-[18px] w-8 shrink-0 rounded-full bg-faint transition-colors data-[state=checked]:bg-accent"
        >
          <RSwitch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-panel shadow transition-transform data-[state=checked]:translate-x-[16px]" />
        </RSwitch.Root>
      </label>
    </>
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
          <RSelect.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
            <ChevronUp className="size-3.5" />
          </RSelect.ScrollUpButton>
          <RSelect.Viewport>
            {groups.map((g, gi) => (
              <RSelect.Group key={g.label || gi}>
                {g.label && <RSelect.Label className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted">{g.label}</RSelect.Label>}
                {g.items.map((it) => (
                  <RSelect.Item
                    key={it.value}
                    value={it.value}
                    className="relative flex h-8 select-none items-center rounded-md pl-7 pr-2 text-[13px] text-ink outline-none data-[highlighted]:bg-field"
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
          <RSelect.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
            <ChevronDown className="size-3.5" />
          </RSelect.ScrollDownButton>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

// ---------- menu ----------
const MENU_CONTENT = 'z-50 min-w-[200px] rounded-xl border border-line-strong bg-panel p-1 shadow-pop animate-pop-in';

// The items of a menu, for the ⋯ button (DropdownMenu) and for right-click (ContextMenu), so the two
// always offer the same actions. An item is { label, icon, description, shortcut, danger, disabled,
// keepFocus, onSelect }, or 'sep' for a divider.
function menuItems(Kit, items, keepFocus) {
  return items.map((it, i) =>
    it === 'sep' ? (
      <Kit.Separator key={`sep-${i}`} className="my-1 h-px bg-line" />
    ) : (
      <Kit.Item
        key={it.label}
        disabled={it.disabled}
        onSelect={() => {
          keepFocus.current = !!it.keepFocus;
          it.onSelect?.();
        }}
        className={cx(
          'flex select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-field [&_svg]:size-4',
          it.danger ? 'text-hot' : 'text-ink',
        )}
      >
        {it.icon}
        <span className="flex flex-col">
          <span>{it.label}</span>
          {it.description && <span className="text-[11.5px] text-muted">{it.description}</span>}
        </span>
        {it.shortcut && <span className="ml-auto pl-4 font-mono text-[11px] text-muted">{keyLabel(it.shortcut)}</span>}
      </Kit.Item>
    ),
  );
}

// An item that moves focus somewhere itself, like Rename, sets keepFocus so the menu doesn't pull it back.
function useKeepFocus() {
  const keepFocus = useRef(false);
  const onCloseAutoFocus = (e) => {
    if (!keepFocus.current) return;
    keepFocus.current = false;
    e.preventDefault();
  };
  return [keepFocus, onCloseAutoFocus];
}

export function Menu({ trigger, items, align = 'end' }) {
  const [keepFocus, onCloseAutoFocus] = useKeepFocus();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className={MENU_CONTENT} onCloseAutoFocus={onCloseAutoFocus}>
          {menuItems(DropdownMenu, items, keepFocus)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// Where the browser's own menu is the useful one: copy and paste in fields and selectable text, and
// opening or copying a link.
const KEEPS_BROWSER_MENU = 'input, textarea, [contenteditable="true"], a[href], [data-selectable]';

// The menu for what is under the pointer, on right-click or a long press. The innermost one wins, so
// a row inside a list shows the row's menu, not the list's. Without items it does nothing.
export function ContextMenu({ items, disabled = false, onOpen, children }) {
  const [keepFocus, onCloseAutoFocus] = useKeepFocus();
  // Decided as the button goes down, before the menu event, so a field or link inside keeps its own menu.
  const [browserMenu, setBrowserMenu] = useState(false);
  if (!items?.length && !onOpen) return children;
  return (
    <RContextMenu.Root modal={false}>
      <RContextMenu.Trigger
        asChild
        disabled={disabled || browserMenu}
        onPointerDownCapture={(e) => setBrowserMenu(!!e.target.closest?.(KEEPS_BROWSER_MENU))}
        onContextMenu={onOpen}
      >
        {children}
      </RContextMenu.Trigger>
      <RContextMenu.Portal>
        {items?.length > 0 && (
          <RContextMenu.Content className={MENU_CONTENT} onCloseAutoFocus={onCloseAutoFocus}>
            {menuItems(RContextMenu, items, keepFocus)}
          </RContextMenu.Content>
        )}
      </RContextMenu.Portal>
    </RContextMenu.Root>
  );
}

// Right-clicking where the app has no menu shows nothing, as in a native app. Text fields, links and
// text marked as selectable keep the browser's menu, for copy and paste.
export function quietContextMenus() {
  const onContextMenu = (e) => {
    if (e.defaultPrevented || e.target.closest?.(KEEPS_BROWSER_MENU)) return;
    e.preventDefault();
  };
  document.addEventListener('contextmenu', onContextMenu);
  return () => document.removeEventListener('contextmenu', onContextMenu);
}

// ---------- pick many ----------
// A select that can hold several values: items are checkboxes, and the menu stays open while you tick
// them. actions sit above the list, such as an option that clears it.
export function PickMany({ label, summary, items, selected, onToggle, actions = [], className }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cx('inline-flex h-7 min-w-0 items-center justify-between gap-2 rounded-lg bg-field px-2.5 text-[12px] text-ink hover:bg-field-hover', className)}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] min-w-[200px] overflow-y-auto rounded-xl border border-line-strong bg-panel p-1 shadow-pop animate-pop-in"
        >
          {actions.map((it) => (
            <DropdownMenu.Item key={it.label} onSelect={it.onSelect} className="flex h-8 select-none items-center rounded-md pl-7 pr-2 text-[13px] text-ink outline-none data-[highlighted]:bg-field">
              {it.label}
            </DropdownMenu.Item>
          ))}
          {actions.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-line" />}
          {items.map((it) => (
            <DropdownMenu.CheckboxItem
              key={it.value}
              checked={selected.includes(it.value)}
              disabled={it.disabled}
              onCheckedChange={(on) => onToggle(it.value, on)}
              onSelect={(e) => e.preventDefault()}
              className="relative flex h-8 select-none items-center rounded-md pl-7 pr-2 text-[13px] text-ink outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-field"
            >
              <DropdownMenu.ItemIndicator className="absolute left-2">
                <Check className="size-3.5" />
              </DropdownMenu.ItemIndicator>
              <span className="truncate">{it.label}</span>
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ---------- dialog ----------
export function Dialog({ open, onOpenChange, title, description, children, width = 480, footer }) {
  // These dialogs open from app state rather than a Radix trigger, so Radix can't know where focus
  // came from. Remember it while rendering, before the dialog takes focus, and hand it back on close.
  const opener = useRef(null);
  if (open && !opener.current && typeof document !== 'undefined') opener.current = document.activeElement;
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <RDialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop animate-pop-in"
          style={{ maxWidth: width }}
          onCloseAutoFocus={(e) => {
            const el = opener.current;
            opener.current = null;
            if (el && el !== document.body && el.isConnected) {
              e.preventDefault();
              el.focus();
            }
          }}
        >
          <div className={cx('flex items-start justify-between gap-4 px-5 pt-5', children ? 'pb-2' : 'pb-5')}>
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
          {children && <div className="min-h-0 overflow-y-auto px-5 pb-5 pt-2">{children}</div>}
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
      spellCheck={false}
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

// A name field that edits live. What you type is kept locally, so you can clear the field and type
// a new name; an empty field falls back when you leave it, and the whole edit is one undo step.
export function NameInput({ label, value, onChange, fallback, max, className }) {
  const [draft, setDraft] = useState(null);
  const finish = () => {
    if (draft !== null) onChange(draft.trim() || fallback);
    setDraft(null);
    commit();
  };
  return (
    <input
      aria-label={label}
      spellCheck={false}
      value={draft ?? value}
      onChange={(e) => {
        const v = clip(oneLine(e.target.value), max);
        setDraft(v);
        if (v.trim()) onChange(v);
      }}
      onBlur={finish}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={cx('min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 hover:border-line focus:border-accent focus:outline-none', className)}
    />
  );
}
