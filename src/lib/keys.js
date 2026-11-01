// Shortcut labels are written with Mac symbols. Everywhere else they read Ctrl, Shift and Backspace.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const keyLabel = (s) =>
  IS_MAC ? s : s.replace(/⌘ \+ /g, 'Ctrl + ').replace(/⇧⌘/g, 'Ctrl+Shift+').replace(/⌘/g, 'Ctrl+').replace(/⇧/g, 'Shift+').replace(/⌥/g, 'Alt+').replace(/⌫/g, 'Backspace');
