/* Headless render check for client.js.
   Runs the plugin in a stubbed DSH client (no browser) and asserts that the
   header button shows the pending text and rotates through pending to-dos. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const failures = [];
function check(name, ok, detail) {
  if (ok) console.log('PASS ' + name);
  else {
    console.log('FAIL ' + name + (detail ? ' -> ' + detail : ''));
    failures.push(name);
  }
}

/* ------------------------------------------------------------ fake environment */
const storage = new Map();
let timers = [];
let timerSeq = 0;

const styleEl = { id: '', textContent: '', parentNode: null };
const head = {
  children: [],
  appendChild(node) {
    node.parentNode = head;
    head.children.push(node);
  },
  removeChild(node) {
    node.parentNode = null;
  },
};

const documentStub = {
  head,
  getElementById: () => null,
  createElement: () => ({ ...styleEl, setAttribute() {} }),
  addEventListener() {},
  removeEventListener() {},
};

const windowStub = {
  innerWidth: 1280,
  innerHeight: 800,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  addEventListener() {},
  removeEventListener() {},
  setInterval(fn, ms) {
    const id = ++timerSeq;
    timers.push({ id, fn, ms });
    return id;
  },
  clearInterval(id) {
    timers = timers.filter((t) => t.id !== id);
  },
  setTimeout: () => 0,
  clearTimeout() {},
};

/* ------------------------------------------------------------------ React stub */
const HEADS = [];
const h = (type, props, ...children) => ({
  type,
  props: props || {},
  children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
});
const React = {
  createElement: h,
  Fragment: 'FRAGMENT',
  useState: (...a) => HEADS.at(-1).useState(...a),
  useEffect: (...a) => HEADS.at(-1).useEffect(...a),
  useRef: (...a) => HEADS.at(-1).useRef(...a),
};

function mount(Component) {
  const hooks = [];
  let ctx = null;
  let tree = null;
  let rerenderWanted = false;

  function render() {
    let idx = 0;
    const pending = [];
    ctx = {
      useState(init) {
        const i = idx++;
        if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init;
        return [
          hooks[i],
          (v) => {
            hooks[i] = typeof v === 'function' ? v(hooks[i]) : v;
            rerenderWanted = true;
          },
        ];
      },
      useRef(init) {
        const i = idx++;
        if (!(i in hooks)) hooks[i] = { current: init };
        return hooks[i];
      },
      useEffect(fn, deps) {
        const i = idx++;
        const prev = hooks[i];
        const run =
          !prev ||
          !deps ||
          !prev.deps ||
          prev.deps.length !== deps.length ||
          deps.some((d, j) => d !== prev.deps[j]);
        if (!prev) hooks[i] = { deps: null, cleanup: null };
        hooks[i].deps = deps || null;
        if (run) pending.push({ i, fn });
      },
    };
    HEADS.push(ctx);
    try {
      tree = Component();
    } finally {
      HEADS.pop();
    }
    for (const p of pending) {
      const slot = hooks[p.i];
      if (typeof slot.cleanup === 'function') slot.cleanup();
      slot.cleanup = p.fn();
    }
    rerenderWanted = false;
  }

  render();

  return {
    get tree() {
      return tree;
    },
    update() {
      if (rerenderWanted) render();
      return tree;
    },
    flushTimers(ms) {
      for (const t of [...timers]) {
        if (t.ms === ms) t.fn();
      }
      this.update();
      return tree;
    },
  };
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node.children.map(textOf).join('');
}

function find(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children) {
    const hit = find(child, predicate);
    if (hit) return hit;
  }
  return null;
}

function byClass(name) {
  return (node) => {
    const cls = node.props && node.props.className;
    return typeof cls === 'string' && cls.split(/\s+/).includes(name);
  };
}

/* seed the persisted state BEFORE the module builds its store */
storage.set('dsh-todo.open.v1', '0');
storage.set(
  'dsh-todo.items.v1',
  JSON.stringify([
    { id: 'a', text: '添加', done: false, due: null, createdAt: 1 },
    { id: 'b', text: '下周二DSH演示', done: false, due: Date.now() + 3 * 86400000, createdAt: 2 },
    { id: 'c', text: '已完成的事', done: true, due: null, createdAt: 3 },
    { id: 'd', text: '过期的报告', done: false, due: Date.now() - 3600000, createdAt: 4 },
    { id: 'e', text: '一小时后开会', done: false, due: Date.now() + 3600000, createdAt: 5 },
  ]),
);

/* ---------------------------------------------------------------------- load it */
let mod = null;
const sandbox = {
  window: { ...windowStub, __ModuleLoader__: { load: (m) => (mod = m) } },
  document: documentStub,
  navigator: { language: 'zh-CN' },
  console,
  Date,
  Math,
  JSON,
  setTimeout: windowStub.setTimeout,
  clearTimeout: windowStub.clearTimeout,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
check('module registers with the loader', !!mod && mod.id === 'dsh-todo', mod && mod.id);

const slots = [];
const clientExports = mod.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

const ctx = {
  get: () => undefined,
  on: () => () => {},
  effect: () => () => {},
  slots: {
    inject(slot, register) {
      register();
    },
    register(meta, Component) {
      slots.push({ meta, Component });
    },
  },
};

/* ---------------------------------------------------------------- run the apply */
clientExports.apply(ctx);

const buttonEntry = slots.find((s) => s.meta.id === 'dsh-todo:button');
const panelEntry = slots.find((s) => s.meta.id === 'dsh-todo:panel');
check('button registered at order -20', !!buttonEntry && buttonEntry.meta.order === -20, buttonEntry && buttonEntry.meta.order);
check('panel registered', !!panelEntry);

/* ------------------------------------------------------------- button content */
const button = mount(buttonEntry.Component);
let text = textOf(button.tree);
check('button shows the most urgent to-do first', text.includes('过期的报告'), JSON.stringify(text));
check('button shows the text without an index', !/\d\s*[、.]/.test(text), JSON.stringify(text));
check('button does not show the completed item', !text.includes('已完成的事'), JSON.stringify(text));
check('button has an ellipsis text cell', !!find(button.tree, byClass('dsh-todo-btn-text')));
check('button carries an urgency dot', !!find(button.tree, byClass('dsh-todo-dot')));
check('overdue item is red', button.tree.props['data-urgency'] === 'overdue', button.tree.props['data-urgency']);
check('tooltip reports the open count', String(button.tree.props.title).includes('未完成 4 项'), button.tree.props.title);

/* rotation walks the pending items, most urgent first */
button.flushTimers(4000);
text = textOf(button.tree);
check('rotation walks to "一小时后开会"', text.includes('一小时后开会'), JSON.stringify(text));
check('item due within a day is yellow', button.tree.props['data-urgency'] === 'soon', button.tree.props['data-urgency']);

button.flushTimers(4000);
text = textOf(button.tree);
check('rotation walks to "下周二DSH演示"', text.includes('下周二DSH演示'), JSON.stringify(text));
check('far-future item is green (later)', button.tree.props['data-urgency'] === 'later', button.tree.props['data-urgency']);

button.flushTimers(4000);
text = textOf(button.tree);
check('rotation walks to the undated item', text.includes('添加'), JSON.stringify(text));
check('no-due item is neutral', button.tree.props['data-urgency'] === 'none', button.tree.props['data-urgency']);

/* panel content: click the button first, then mount the panel */
button.tree.props.onClick({ preventDefault() {}, stopPropagation() {} });
button.update();
check('clicking the button opens it', /\bis-open\b/.test(button.tree.props.className), button.tree.props.className);

const panel = mount(panelEntry.Component);
let panelText = textOf(panel.tree);
check('panel lists the pending items', panelText.includes('添加') && panelText.includes('下周二DSH演示'), JSON.stringify(panelText));
check('panel hides the completed item by default', !panelText.includes('已完成的事'), JSON.stringify(panelText));
check('panel shows a done counter', panelText.includes('已完成 1 项'), JSON.stringify(panelText));
const card = find(panel.tree, byClass('dsh-todo-card'));
check('panel card has an explicit height', !!card && typeof card.props.style.height === 'string', card && JSON.stringify(card.props.style));
check('panel card has an explicit width', !!card && typeof card.props.style.width === 'string', card && JSON.stringify(card.props.style));

const pendingUl = find(panel.tree, (n) => n.props && n.props.className === 'dsh-todo-list');
const pendingOrder = pendingUl.children.map((row) => textOf(find(row, byClass('dsh-todo-text'))));
check(
  'pending list is sorted by urgency',
  JSON.stringify(pendingOrder) === JSON.stringify(['过期的报告', '一小时后开会', '下周二DSH演示', '添加']),
  JSON.stringify(pendingOrder),
);

/* the finished items sit behind an expandable section */
const doneHead = find(panel.tree, byClass('dsh-todo-donehead'));
check('done section has a toggle', !!doneHead);
doneHead.props.onClick();
panel.update();
check('expanding shows the completed item', textOf(panel.tree).includes('已完成的事'), JSON.stringify(textOf(panel.tree)));
find(panel.tree, byClass('dsh-todo-donehead')).props.onClick();
panel.update();
check('collapsing hides it again', !textOf(panel.tree).includes('已完成的事'), JSON.stringify(textOf(panel.tree)));

/* quick due chips fill the due field */
const chip = find(panel.tree, (n) => n.type === 'button' && n.props.className === 'dsh-todo-chip' && textOf(n) === '今天');
check('the form offers a "今天" chip', !!chip);
chip.props.onClick();
panel.update();
const freshDue = find(panel.tree, (n) => n.type === 'input' && n.props.className === 'dsh-todo-due');
check('the chip fills a concrete due time', /T\d{2}:00$/.test(freshDue.props.value), freshDue.props.value);

/* ------------------------------------------------------------------- editing */
function rowByText(tree, needle) {
  return find(tree, (n) => n.props && /dsh-todo-item/.test(String(n.props.className || '')) && textOf(n).includes(needle));
}

const editButtons = [];
(function collect(node) {
  if (Array.isArray(node)) return node.forEach(collect);
  if (!node || typeof node !== 'object') return;
  if (/dsh-todo-edit-btn/.test(node.props && node.props.className ? node.props.className : '')) editButtons.push(node);
  node.children.forEach(collect);
})(panel.tree);
check('every pending row offers an edit control', editButtons.length === 4, String(editButtons.length));

const targetRow = rowByText(panel.tree, '下周二DSH演示');
check('the edited row is present', !!targetRow);
find(targetRow, byClass('dsh-todo-edit-btn')).props.onClick();
panel.update();
let editor = find(panel.tree, byClass('dsh-todo-edit'));
check('edit mode opens an inline editor', !!editor);
let editInput = find(editor, (n) => n.type === 'input' && n.props.className === 'dsh-todo-input');
check('editor is prefilled with the item text', !!editInput && editInput.props.value === '下周二DSH演示', editInput && editInput.props.value);

editInput.props.onChange({ target: { value: '下周二 DSH 演示（已改）' } });
panel.update();
editor = find(panel.tree, byClass('dsh-todo-edit'));
const dueInput = find(editor, (n) => n.type === 'input' && n.props.className === 'dsh-todo-due');
check('editor exposes the due time', !!dueInput && typeof dueInput.props.value === 'string' && dueInput.props.value.length > 0, dueInput && dueInput.props.value);

const saveBtn = find(editor, byClass('dsh-todo-save'));
check('save button enabled with text', !!saveBtn && saveBtn.props.disabled === false);
saveBtn.props.onClick();
panel.update();
panelText = textOf(panel.tree);
check('saved text replaces the old text', panelText.includes('下周二 DSH 演示（已改）') && !panelText.includes('下周二DSH演示'), JSON.stringify(panelText));
check('edit mode closed after save', !find(panel.tree, byClass('dsh-todo-edit')));

const persisted = JSON.parse(storage.get('dsh-todo.items.v1'));
check('edit is persisted to localStorage', persisted.some((i) => i.text === '下周二 DSH 演示（已改）'), JSON.stringify(persisted.map((i) => i.text)));
check('due time survived the edit', persisted.some((i) => i.text === '下周二 DSH 演示（已改）' && typeof i.due === 'number'));

/* editing the due time alone recolours the header entry */
const editedRow = rowByText(panel.tree, '下周二 DSH 演示（已改）');
check('the edited row is still listed', !!editedRow);
find(editedRow, byClass('dsh-todo-edit-btn')).props.onClick();
panel.update();
const edit2 = find(panel.tree, byClass('dsh-todo-edit'));
const dueInput2 = find(edit2, (n) => n.type === 'input' && n.props.className === 'dsh-todo-due');
const soon = new Date(Date.now() + 2 * 3600000);
const pad = (n) => String(n).padStart(2, '0');
const localValue =
  soon.getFullYear() + '-' + pad(soon.getMonth() + 1) + '-' + pad(soon.getDate()) + 'T' + pad(soon.getHours()) + ':' + pad(soon.getMinutes());
dueInput2.props.onChange({ target: { value: localValue } });
panel.update();
find(panel.tree, byClass('dsh-todo-save')).props.onClick();
panel.update();
check('due edit lands in the store', JSON.parse(storage.get('dsh-todo.items.v1')).find((i) => i.text === '下周二 DSH 演示（已改）').due < Date.now() + 3 * 3600000);

console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : '\nFAILED: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
