// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { quietContextMenus } from '../src/components/ui.jsx';

const rightClick = (el) => {
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e.defaultPrevented;
};

let stop = () => {};
afterEach(() => {
  stop();
  document.body.innerHTML = '';
});

describe('quietContextMenus', () => {
  it("hides the browser's menu where the app has none, and keeps it for text, fields and links", () => {
    stop = quietContextMenus();
    document.body.innerHTML = `
      <div id="panel"><span id="label">Layers</span></div>
      <input id="field" /><textarea id="notes"></textarea><div contenteditable="true"><b id="rich">x</b></div>
      <a id="link" href="https://example.org">licence</a><pre data-selectable><code id="code">play()</code></pre>`;
    expect(rightClick(document.getElementById('panel'))).toBe(true);
    expect(rightClick(document.getElementById('label'))).toBe(true);
    for (const id of ['field', 'notes', 'rich', 'link', 'code']) expect(rightClick(document.getElementById(id)), id).toBe(false);
  });

  it('stops when removed', () => {
    quietContextMenus()();
    document.body.innerHTML = '<div id="panel"></div>';
    expect(rightClick(document.getElementById('panel'))).toBe(false);
  });
});
