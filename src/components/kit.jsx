import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Checkbox as RCheckbox, Dialog as RDialog, DropdownMenu as RMenu, Switch as RSwitch, Tabs as RTabs } from 'radix-ui';
import { Archive, Bell, Check, ChevronDown, Copy, Heart, Pencil, SendHorizontal, Share2, Trash2, X } from 'lucide-react';
import { roleLabel } from '../engine/roles.js';
import { playRole } from '../playback.js';

// A small UI kit styled after shadcn/ui (MIT, see licenses/shadcn-ui.txt), the components most React
// apps start from. Every control plays the sound mapped to the interaction it stands for.

const cx = (...c) => c.filter(Boolean).join(' ');
const KitContext = createContext({ play: () => {}, hover: () => {}, container: null, toast: () => {} });
const useKit = () => useContext(KitContext);

const HOVER_GAP_MS = 90;
const REPLY_DELAY_MS = 1100;
const NOTIFY_DELAY_MS = 500;
const TOAST_MS = 4000;
const REPLIES = ['Looks great, thanks!', 'On it. Give me five minutes.', 'Sent the file over.', 'Can we talk at 3?', 'Perfect, shipping it.'];

const FOCUS = 'outline-none focus-visible:border-kit-ring focus-visible:ring-[3px] focus-visible:ring-kit-ring/50';
const BUTTON_BASE = `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${FOCUS}`;
const BUTTON_VARIANT = {
  default: 'bg-kit-primary text-kit-primary-fg shadow-xs hover:bg-kit-primary/90',
  destructive: 'bg-kit-destructive-btn text-white shadow-xs hover:bg-kit-destructive-btn/90',
  outline: 'border border-kit-input bg-kit-field shadow-xs hover:bg-kit-accent hover:text-kit-accent-fg',
  secondary: 'bg-kit-secondary text-kit-secondary-fg shadow-xs hover:bg-kit-secondary/80',
  ghost: 'hover:bg-kit-accent hover:text-kit-accent-fg',
};
const BUTTON_SIZE = { default: 'h-9 px-4 py-2 has-[>svg]:px-3', sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5', icon: 'size-9' };
const INPUT = `flex h-9 w-full min-w-0 rounded-md border border-kit-input bg-kit-field px-3 py-1 text-sm text-kit-fg shadow-xs transition-[color,box-shadow] placeholder:text-kit-muted-fg aria-invalid:border-kit-destructive aria-invalid:ring-kit-destructive/20 ${FOCUS}`;

function KitButton({ variant = 'default', size = 'default', sound = 'tap', className, onClick, ...props }) {
  const { play, hover } = useKit();
  return (
    <button
      type="button"
      className={cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      onPointerEnter={hover}
      onClick={(e) => {
        if (sound) play(sound);
        onClick?.(e);
      }}
      {...props}
    />
  );
}

function KitSwitch({ label, description, defaultChecked = false }) {
  const { play } = useKit();
  const id = useRef(`kit-switch-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-kit-border p-3">
      <label htmlFor={id} className="flex flex-col gap-1">
        <span className="text-sm font-medium leading-none">{label}</span>
        <span className="text-sm text-kit-muted-fg">{description}</span>
      </label>
      <RSwitch.Root
        id={id}
        defaultChecked={defaultChecked}
        onCheckedChange={(on) => play(on ? 'toggle-on' : 'toggle-off')}
        className={`group inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all data-[state=checked]:bg-kit-primary data-[state=unchecked]:bg-kit-track-off ${FOCUS}`}
      >
        <RSwitch.Thumb className="pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=checked]:bg-kit-thumb-on data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-kit-thumb-off" />
      </RSwitch.Root>
    </div>
  );
}

function KitCheckbox({ label, checked, onCheckedChange, defaultChecked, strike = false }) {
  const { play } = useKit();
  const id = useRef(`kit-check-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className="flex items-center gap-3">
      <RCheckbox.Root
        id={id}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(v) => {
          play('select');
          onCheckedChange?.(v);
        }}
        className={`peer grid size-4 shrink-0 place-items-center rounded-[4px] border border-kit-input bg-kit-field shadow-xs transition-shadow data-[state=checked]:border-kit-primary data-[state=checked]:bg-kit-primary data-[state=checked]:text-kit-primary-fg ${FOCUS}`}
      >
        <RCheckbox.Indicator>
          <Check className="size-3.5" />
        </RCheckbox.Indicator>
      </RCheckbox.Root>
      <label htmlFor={id} className={cx('text-sm font-medium leading-none', strike && 'peer-data-[state=checked]:text-kit-muted-fg peer-data-[state=checked]:line-through')}>
        {label}
      </label>
    </div>
  );
}

function KitCard({ title, description, roles, children }) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-kit-border bg-kit-card py-5 text-kit-fg shadow-sm" aria-label={title}>
      <div className="flex flex-col gap-1.5 px-5">
        <h3 className="font-semibold leading-none">{title}</h3>
        <p className="text-sm text-kit-muted-fg">{description}</p>
      </div>
      <div className="px-5">{children}</div>
      <p className="px-5 text-xs text-kit-muted-fg">Sounds: {roles.map(roleLabel).join(', ')}</p>
    </section>
  );
}

function ButtonsCard() {
  const [liked, setLiked] = useState(false);
  return (
    <KitCard title="Buttons" description="The actions people take most." roles={['tap', 'hover', 'delete']}>
      <div className="flex flex-wrap gap-2">
        <KitButton>Continue</KitButton>
        <KitButton variant="secondary">Save draft</KitButton>
        <KitButton variant="outline">Cancel</KitButton>
        <KitButton variant="destructive" sound="delete">
          <Trash2 />
          Delete
        </KitButton>
      </div>
      <div className="mt-3 flex gap-2">
        <KitButton variant="outline" size="icon" aria-label={liked ? 'Unlike' : 'Like'} aria-pressed={liked} onClick={() => setLiked(!liked)}>
          <Heart className={liked ? 'fill-current text-kit-destructive' : ''} />
        </KitButton>
        <KitButton variant="outline" size="icon" aria-label="Copy link">
          <Copy />
        </KitButton>
        <KitButton variant="ghost" size="icon" aria-label="Share">
          <Share2 />
        </KitButton>
      </div>
    </KitCard>
  );
}

function SettingsCard() {
  return (
    <KitCard title="Settings" description="Switches and checkboxes." roles={['toggle-on', 'toggle-off', 'select']}>
      <div className="flex flex-col gap-3">
        <KitSwitch label="Push notifications" description="Get told when someone replies." defaultChecked />
        <KitSwitch label="Dark mode" description="Use a dark theme on this device." />
        <KitCheckbox label="Email me a weekly summary" />
      </div>
    </KitCard>
  );
}

function TabsCard() {
  const { play, container } = useKit();
  const picked = useRef(false);
  return (
    <KitCard title="Tabs and menus" description="Switching views and picking from a list." roles={['select', 'open', 'close']}>
      <RTabs.Root defaultValue="overview" onValueChange={() => play('select')} className="flex flex-col gap-3">
        <RTabs.List className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-kit-muted p-[3px] text-kit-muted-fg">
          {['Overview', 'Activity', 'Settings'].map((t) => (
            <RTabs.Trigger
              key={t}
              value={t.toLowerCase()}
              className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md border border-transparent px-2.5 py-1 text-sm font-medium whitespace-nowrap text-kit-fg transition-[color,box-shadow] data-[state=active]:bg-kit-bg data-[state=active]:shadow-sm ${FOCUS}`}
            >
              {t}
            </RTabs.Trigger>
          ))}
        </RTabs.List>
        <RTabs.Content value="overview" className="text-sm text-kit-muted-fg">
          Three projects are on track and one needs a review.
        </RTabs.Content>
        <RTabs.Content value="activity" className="text-sm text-kit-muted-fg">
          Maya left two comments on the onboarding flow.
        </RTabs.Content>
        <RTabs.Content value="settings" className="text-sm text-kit-muted-fg">
          Workspace settings are managed by your admin.
        </RTabs.Content>
      </RTabs.Root>
      <div className="mt-4">
        <RMenu.Root
          onOpenChange={(open) => {
            // Picking an item closes the menu too; that close stays quiet so the item's sound is heard alone.
            if (!open && picked.current) {
              picked.current = false;
              return;
            }
            play(open ? 'open' : 'close');
          }}
        >
          <RMenu.Trigger asChild>
            <button type="button" className={cx(BUTTON_BASE, BUTTON_VARIANT.outline, BUTTON_SIZE.sm)}>
              Options
              <ChevronDown />
            </button>
          </RMenu.Trigger>
          <RMenu.Portal container={container}>
            <RMenu.Content align="start" sideOffset={4} className="z-40 min-w-[10rem] rounded-md border border-kit-border bg-kit-popover p-1 text-kit-fg shadow-md">
              {[
                ['Edit', Pencil],
                ['Duplicate', Copy],
                ['Archive', Archive],
              ].map(([label, Icon]) => (
                <RMenu.Item
                  key={label}
                  onSelect={() => {
                    picked.current = true;
                    play('select');
                  }}
                  className="relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-kit-accent data-[highlighted]:text-kit-accent-fg [&_svg]:size-4 [&_svg]:text-kit-muted-fg"
                >
                  <Icon />
                  {label}
                </RMenu.Item>
              ))}
            </RMenu.Content>
          </RMenu.Portal>
        </RMenu.Root>
      </div>
    </KitCard>
  );
}

function ChatCard() {
  const { play } = useKit();
  const [messages, setMessages] = useState([
    { id: 1, mine: false, text: 'Did the new sounds land?' },
    { id: 2, mine: true, text: 'Trying them now.' },
  ]);
  const [draft, setDraft] = useState('');
  const log = useRef(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);
  const send = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    play('send');
    setMessages((m) => [...m, { id: Date.now(), mine: true, text }]);
    setDraft('');
    timers.current.push(
      setTimeout(() => {
        play('receive');
        setMessages((m) => [...m, { id: Date.now(), mine: false, text: REPLIES[m.length % REPLIES.length] }]);
      }, REPLY_DELAY_MS),
    );
  };
  return (
    <KitCard title="Messages" description="Sending a message and getting a reply." roles={['send', 'receive']}>
      <div ref={log} className="flex h-44 flex-col gap-2 overflow-y-auto rounded-lg border border-kit-border p-3" aria-label="Conversation">
        {messages.map((m) => (
          <p key={m.id} className={cx('max-w-[80%] rounded-lg px-3 py-2 text-sm', m.mine ? 'self-end bg-kit-primary text-kit-primary-fg' : 'self-start bg-kit-muted')}>
            {m.text}
          </p>
        ))}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message" aria-label="Message" className={INPUT} />
        <button type="submit" aria-label="Send" className={cx(BUTTON_BASE, BUTTON_VARIANT.default, BUTTON_SIZE.icon)}>
          <SendHorizontal />
        </button>
      </form>
    </KitCard>
  );
}

function FormCard() {
  const { play, toast } = useKit();
  const [name, setName] = useState('Ada Lovelace');
  const [error, setError] = useState('');
  const save = () => {
    if (!name.trim()) {
      setError('Enter a display name.');
      play('error');
      return;
    }
    setError('');
    play('success');
    toast({ title: 'Changes saved', description: 'Your profile is up to date.' });
  };
  return (
    <KitCard title="Save a form" description="Clear the name and save again to hear the error." roles={['success', 'error']}>
      <div className="flex flex-col gap-2">
        <label htmlFor="kit-name" className="text-sm font-medium leading-none">
          Display name
        </label>
        <input id="kit-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'kit-name-error' : undefined} className={INPUT} />
        {error && (
          <p id="kit-name-error" className="text-sm text-kit-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <KitButton sound={null} onClick={save}>
          Save
        </KitButton>
        <KitButton
          variant="outline"
          sound="error"
          onClick={() => toast({ title: "Couldn't save", description: 'Check your connection and try again.', tone: 'error' })}
        >
          Try a failing save
        </KitButton>
      </div>
    </KitCard>
  );
}

function NotificationsCard() {
  const { play, toast } = useKit();
  const [unread, setUnread] = useState(2);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const notify = () => {
    timers.current.push(
      setTimeout(() => {
        play('notification');
        setUnread((n) => n + 1);
        toast({ title: 'New comment', description: 'Maya replied to your design review.' });
      }, NOTIFY_DELAY_MS),
    );
  };
  return (
    <KitCard title="Notifications" description="Something arriving while you work." roles={['notification', 'tap']}>
      <div className="flex items-center gap-3">
        <span className="relative">
          <KitButton variant="outline" size="icon" aria-label={`Notifications, ${unread} unread`} onClick={() => setUnread(0)}>
            <Bell />
          </KitButton>
          {unread > 0 && (
            <span className="pointer-events-none absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-kit-destructive px-1 text-xs font-medium text-white" aria-hidden="true">
              {unread}
            </span>
          )}
        </span>
        <KitButton variant="secondary" sound={null} onClick={notify}>
          Send me a notification
        </KitButton>
      </div>
    </KitCard>
  );
}

function DialogCard() {
  const { play, toast, container } = useKit();
  const [open, setOpen] = useState(false);
  const saving = useRef(false);
  const change = (next) => {
    setOpen(next);
    if (next) play('open');
    else if (saving.current) saving.current = false;
    else play('close');
  };
  return (
    <KitCard title="Dialog" description="A dialog opening and closing." roles={['open', 'close', 'success']}>
      <RDialog.Root open={open} onOpenChange={change}>
        <RDialog.Trigger asChild>
          <button type="button" className={cx(BUTTON_BASE, BUTTON_VARIANT.outline, BUTTON_SIZE.default)}>
            Edit profile
          </button>
        </RDialog.Trigger>
        <RDialog.Portal container={container}>
          <RDialog.Overlay className="absolute inset-0 z-30 bg-black/50" />
          <RDialog.Content className="absolute left-1/2 top-1/2 z-30 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-kit-border bg-kit-bg p-6 text-kit-fg shadow-lg">
            <div className="flex flex-col gap-2">
              <RDialog.Title className="text-lg font-semibold leading-none">Edit profile</RDialog.Title>
              <RDialog.Description className="text-sm text-kit-muted-fg">Make changes to your profile, then save.</RDialog.Description>
            </div>
            <input aria-label="Username" defaultValue="@ada" className={INPUT} />
            <div className="flex justify-end gap-2">
              <RDialog.Close asChild>
                <button type="button" className={cx(BUTTON_BASE, BUTTON_VARIANT.outline, BUTTON_SIZE.default)}>
                  Cancel
                </button>
              </RDialog.Close>
              <button
                type="button"
                className={cx(BUTTON_BASE, BUTTON_VARIANT.default, BUTTON_SIZE.default)}
                onClick={() => {
                  saving.current = true;
                  play('success');
                  setOpen(false);
                  toast({ title: 'Profile updated' });
                }}
              >
                Save changes
              </button>
            </div>
            <RDialog.Close className={`absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 [&_svg]:size-4 ${FOCUS}`} aria-label="Close">
              <X />
            </RDialog.Close>
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>
    </KitCard>
  );
}

const TASKS = ['Pick a key for the set', 'Map every interaction', 'Export the sounds'];

function TasksCard() {
  const { play, toast } = useKit();
  const [tasks, setTasks] = useState(TASKS.map((text, i) => ({ id: i, text })));
  const remove = (task) => {
    play('delete');
    setTasks((list) => list.filter((t) => t.id !== task.id));
    toast({
      title: 'Task deleted',
      description: task.text,
      action: { label: 'Undo', onClick: () => setTasks((list) => [...list, task].sort((a, b) => a.id - b.id)) },
    });
  };
  return (
    <KitCard title="Tasks" description="Checking things off, deleting and undoing." roles={['select', 'delete', 'tap']}>
      <ul className="flex flex-col gap-1">
        {tasks.map((task) => (
          <li key={task.id} className="group flex items-center justify-between gap-2 rounded-md py-1 pl-1">
            <KitCheckbox label={task.text} strike />
            <KitButton variant="ghost" size="icon" sound={null} aria-label={`Delete ${task.text}`} className="size-8" onClick={() => remove(task)}>
              <Trash2 />
            </KitButton>
          </li>
        ))}
        {!tasks.length && <li className="py-2 text-sm text-kit-muted-fg">Nothing left to do.</li>}
      </ul>
    </KitCard>
  );
}

function Toasts({ toasts, dismiss }) {
  return (
    <ol className="pointer-events-none absolute bottom-4 right-4 z-20 flex w-[320px] max-w-[calc(100%-2rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <li key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-lg border border-kit-border bg-kit-popover p-4 text-kit-fg shadow-lg animate-pop-in">
          <div className="min-w-0 flex-1">
            <p className={cx('text-sm font-semibold', t.tone === 'error' && 'text-kit-destructive')}>{t.title}</p>
            {t.description && <p className="text-sm text-kit-muted-fg">{t.description}</p>}
          </div>
          {t.action && (
            <KitButton
              size="sm"
              variant="outline"
              onClick={() => {
                t.action.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </KitButton>
          )}
        </li>
      ))}
    </ol>
  );
}

export function KitShowcase({ container }) {
  const [toasts, setToasts] = useState([]);
  const lastHover = useRef(0);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const dismiss = (id) => setToasts((list) => list.filter((t) => t.id !== id));
  const value = {
    container,
    play: playRole,
    // Hover only counts for a mouse, and sweeping across a row of buttons plays once, not five times.
    hover: (e) => {
      if (e.pointerType !== 'mouse' || performance.now() - lastHover.current < HOVER_GAP_MS) return;
      lastHover.current = performance.now();
      playRole('hover');
    },
    toast: (t) => {
      const id = Math.random();
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      timers.current.push(setTimeout(() => dismiss(id), TOAST_MS));
    },
  };
  return (
    <KitContext.Provider value={value}>
      <div className="@container min-h-full bg-kit-bg p-4 text-kit-fg">
        <div className="grid items-start gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
          <ButtonsCard />
          <SettingsCard />
          <ChatCard />
          <FormCard />
          <TabsCard />
          <NotificationsCard />
          <DialogCard />
          <TasksCard />
        </div>
      </div>
      <Toasts toasts={toasts} dismiss={dismiss} />
    </KitContext.Provider>
  );
}
