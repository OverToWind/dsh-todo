/**
 * Client half of `dsh-todo`.
 *
 * Renders a "To-dos" button at the left end of the session header utilities
 * (the right-hand button group) and a persistent floating card that shows the
 * list at all times. Items may carry a due time and are colour-coded by it:
 * overdue = red, due within 24 hours = yellow, later = green.
 */
window.__ModuleLoader__.load({
  id: 'dsh-todo',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const STORAGE_KEY = 'dsh-todo.items.v1';
    const OPEN_KEY = 'dsh-todo.open.v1';
    const SHOW_DONE_KEY = 'dsh-todo.showdone.v1';
    const STYLE_ID = 'dsh-todo-styles';
    const CARD_WIDTH = 340;
    const GAP = 8;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const TICK_MS = 4000;

    const EN = {
      button: 'To-dos',
      title: 'To-dos',
      more: 'Click to open the to-do list',
      placeholder: 'Write a to-do, press Enter',
      add: 'Add',
      empty: 'Nothing to do yet.',
      clearDone: 'Clear done',
      deleteItem: 'Delete',
      edit: 'Edit',
      editText: 'Edit to-do',
      editDueHint: 'Due time (optional)',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      remaining: '{n} open',
      dueHint: 'Optional due time',
      clearDue: 'No due time',
      noDue: 'No due time',
      overdue: 'Overdue',
      soon: 'Due within 24 hours',
      later: 'Due later',
      allDone: 'All done for now',
      today: 'Today',
      tomorrow: 'Tomorrow',
      doneSection: 'Done ({n})',
      showDone: 'Show done items',
      hideDone: 'Hide done items',
    };

    const ZH = {
      button: '待办',
      title: '待办事项',
      more: '点击展开待办列表',
      placeholder: '输入待办内容，回车添加',
      add: '添加',
      empty: '还没有待办事项',
      clearDone: '清除已完成',
      deleteItem: '删除',
      edit: '编辑',
      editText: '编辑待办',
      editDueHint: '截止时间（可选）',
      save: '保存',
      cancel: '取消',
      close: '关闭',
      remaining: '未完成 {n} 项',
      dueHint: '可选截止时间',
      clearDue: '不限时间',
      noDue: '不限时间',
      overdue: '已过期',
      soon: '24 小时内到期',
      later: '稍后到期',
      allDone: '当前都完成了',
      today: '今天',
      tomorrow: '明天',
      doneSection: '已完成 {n} 项',
      showDone: '展开已完成',
      hideDone: '收起已完成',
    };

    /** Locale translate function, when the Client locale service is available. */
    let translate = null;

    function prefersZh() {
      const lang = (typeof navigator !== 'undefined' && navigator.language) || '';
      return /^zh/i.test(lang);
    }

    function t(key) {
      if (typeof translate === 'function') {
        try {
          const value = translate(key);
          if (typeof value === 'string' && value && value !== key) return value;
        } catch (error) {
          /* fall through to the local dictionary */
        }
      }
      const dict = prefersZh() ? ZH : EN;
      return dict[key] || EN[key] || key;
    }

    function format(template, count) {
      return String(template).replace('{n}', String(count));
    }

    function pad2(value) {
      return value < 10 ? '0' + value : String(value);
    }

    /** `HH:mm` for today, `MM-DD HH:mm` otherwise. */
    function formatDue(ms) {
      const date = new Date(ms);
      const now = new Date();
      const time = pad2(date.getHours()) + ':' + pad2(date.getMinutes());
      if (date.toDateString() === now.toDateString()) return time;
      return pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) + ' ' + time;
    }

    /** `value` for an <input type="datetime-local">. */
    function toLocalInput(ms) {
      const date = new Date(ms);
      return (
        date.getFullYear() +
        '-' +
        pad2(date.getMonth() + 1) +
        '-' +
        pad2(date.getDate()) +
        'T' +
        pad2(date.getHours()) +
        ':' +
        pad2(date.getMinutes())
      );
    }

    function fromLocalInput(value) {
      if (!value) return null;
      const ms = new Date(value).getTime();
      return Number.isFinite(ms) ? ms : null;
    }

    /** Next full hour, used as the pre-filled due time of a new item. */
    function defaultDueInput() {
      const date = new Date();
      date.setMinutes(0, 0, 0);
      date.setHours(date.getHours() + 1);
      return toLocalInput(date.getTime());
    }

    /** Due time of the `今天` / `明天` quick picks. */
    function quickDueInput(kind) {
      const date = new Date();
      if (kind === 'tomorrow' || date.getHours() >= 18) {
        date.setDate(date.getDate() + 1);
        date.setHours(9, 0, 0, 0);
      } else {
        date.setHours(18, 0, 0, 0);
      }
      return toLocalInput(date.getTime());
    }

    const URGENCY_RANK = { overdue: 0, soon: 1, later: 2, none: 3, done: 4 };

    /**
     * Pending items first, most urgent on top (overdue, then due within a day,
     * then later, then undated oldest-first); finished items below, newest first.
     */
    function sortItems(items, now) {
      return items.slice().sort(function (a, b) {
        const ua = URGENCY_RANK[urgencyOf(a, now)];
        const ub = URGENCY_RANK[urgencyOf(b, now)];
        if (ua !== ub) return ua - ub;
        if (a.due !== b.due) {
          const da = a.due === null ? Infinity : a.due;
          const db = b.due === null ? Infinity : b.due;
          if (da !== db) return da - db;
        }
        if (ua === URGENCY_RANK.done) return (b.createdAt || 0) - (a.createdAt || 0);
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
    }

    /* ------------------------------------------------------------------ store */

    function loadItems() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter(function (item) {
            return item && typeof item.id === 'string' && typeof item.text === 'string';
          })
          .map(function (item) {
            return {
              id: item.id,
              text: item.text,
              done: !!item.done,
              due: typeof item.due === 'number' && Number.isFinite(item.due) ? item.due : null,
              createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0,
            };
          });
      } catch (error) {
        return [];
      }
    }

    function saveItems(items) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (error) {
        console.warn('[dsh-todo] could not persist to-dos:', error);
      }
    }

    function loadOpen() {
      try {
        const raw = window.localStorage.getItem(OPEN_KEY);
        if (raw === null) return true;
        return raw === '1';
      } catch (error) {
        return true;
      }
    }

    function saveOpen(open) {
      try {
        window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
      } catch (error) {
        /* ignore */
      }
    }

    function loadShowDone() {
      try {
        return window.localStorage.getItem(SHOW_DONE_KEY) === '1';
      } catch (error) {
        return false;
      }
    }

    function saveShowDone(value) {
      try {
        window.localStorage.setItem(SHOW_DONE_KEY, value ? '1' : '0');
      } catch (error) {
        /* ignore */
      }
    }

    function createStore() {
      let state = { open: loadOpen(), items: loadItems(), anchor: null };
      const listeners = [];

      function notify() {
        listeners.slice().forEach(function (fn) {
          try {
            fn();
          } catch (error) {
            console.error('[dsh-todo] listener failed:', error);
          }
        });
      }

      function update(patch) {
        state = Object.assign({}, state, patch);
        notify();
      }

      function commit(items) {
        saveItems(items);
        update({ items: items });
      }

      return {
        get: function () {
          return state;
        },
        subscribe: function (fn) {
          listeners.push(fn);
          return function () {
            const index = listeners.indexOf(fn);
            if (index >= 0) listeners.splice(index, 1);
          };
        },
        setOpen: function (open, anchor) {
          const next = !!open;
          if (anchor !== undefined) {
            saveOpen(next);
            update({ open: next, anchor: anchor });
          } else {
            saveOpen(next);
            update({ open: next });
          }
        },
        setAnchor: function (anchor) {
          update({ anchor: anchor });
        },
        add: function (text, due) {
          const value = String(text == null ? '' : text).trim();
          if (!value) return;
          commit(
            state.items.concat([
              {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                text: value.slice(0, 500),
                done: false,
                due: typeof due === 'number' && Number.isFinite(due) ? due : null,
                createdAt: Date.now(),
              },
            ]),
          );
        },
        toggleItem: function (id) {
          commit(
            state.items.map(function (item) {
              return item.id === id ? Object.assign({}, item, { done: !item.done }) : item;
            }),
          );
        },
        updateItem: function (id, patch) {
          const next = Object.assign({}, patch);
          if ('text' in next) {
            const value = String(next.text == null ? '' : next.text).trim();
            if (!value) return;
            next.text = value.slice(0, 500);
          }
          if ('due' in next) {
            next.due = typeof next.due === 'number' && Number.isFinite(next.due) ? next.due : null;
          }
          commit(
            state.items.map(function (item) {
              return item.id === id ? Object.assign({}, item, next) : item;
            }),
          );
        },
        remove: function (id) {
          commit(
            state.items.filter(function (item) {
              return item.id !== id;
            }),
          );
        },
        clearDone: function () {
          commit(
            state.items.filter(function (item) {
              return !item.done;
            }),
          );
        },
      };
    }

    const store = createStore();

    function useStoreState() {
      const [state, setState] = React.useState(store.get);
      React.useEffect(function () {
        return store.subscribe(function () {
          setState(store.get());
        });
      }, []);
      return state;
    }

    /* ----------------------------------------------------------------- styles */

    const CSS = [
      '.dsh-todo-btn {',
      '  display: inline-flex; align-items: center; gap: 7px;',
      '  flex: 0 0 auto; width: 320px; box-sizing: border-box; height: 30px; padding: 0 10px; margin: 0;',
      '  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;',
      '  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);',
      '  font: inherit; font-size: 12px; font-weight: 600; line-height: 1; cursor: pointer; text-align: left;',
      '  overflow: hidden;',
      '}',
      '.dsh-todo-btn:hover { filter: brightness(0.96); }',
      '.dsh-todo-btn svg { flex: none; }',
      '.dsh-todo-btn-label, .dsh-todo-btn-text {',
      '  flex: 1 1 auto; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
      '}',
      '.dsh-todo-dot {',
      '  flex: none; width: 6px; height: 6px; border-radius: 50%;',
      '  background: var(--dsw-alias-state-idle-primary);',
      '}',
      '.dsh-todo-btn[data-urgency="overdue"] {',
      '  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, var(--dsw-alias-bg-layer-1));',
      '  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, var(--dsw-alias-border-l2));',
      '}',
      '.dsh-todo-btn[data-urgency="soon"] {',
      '  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, var(--dsw-alias-bg-layer-1));',
      '  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, var(--dsw-alias-border-l2));',
      '}',
      '.dsh-todo-btn[data-urgency="later"], .dsh-todo-btn[data-urgency="none"] {',
      '  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, var(--dsw-alias-bg-layer-1));',
      '  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 38%, var(--dsw-alias-border-l2));',
      '}',
      '.dsh-todo-btn[data-urgency="overdue"] .dsh-todo-dot { background: var(--dsw-alias-state-error-primary); }',
      '.dsh-todo-btn[data-urgency="soon"] .dsh-todo-dot { background: var(--dsw-alias-state-warn-primary); }',
      '.dsh-todo-btn[data-urgency="later"] .dsh-todo-dot, .dsh-todo-btn[data-urgency="none"] .dsh-todo-dot { background: var(--dsw-alias-state-success-primary); }',
      '.dsh-todo-btn[data-urgency="overdue"] .dsh-todo-btn-text { color: var(--dsw-alias-state-error-primary); }',
      '.dsh-todo-btn[data-urgency="soon"] .dsh-todo-btn-text { color: var(--dsw-alias-state-warn-primary); }',
      '.dsh-todo-btn[data-urgency="later"] .dsh-todo-btn-text, .dsh-todo-btn[data-urgency="none"] .dsh-todo-btn-text { color: var(--dsw-alias-state-success-primary); }',
      '.dsh-todo-btn.is-open { border-color: var(--dsw-alias-brand-primary); }',
      '.dsh-todo-layer { position: fixed; inset: 0; pointer-events: none; z-index: 40; }',
      '.dsh-todo-card {',
      '  position: fixed; width: ' + CARD_WIDTH + 'px; box-sizing: border-box;',
      '  display: flex; flex-direction: column; pointer-events: auto;',
      '  background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary);',
      '  border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px;',
      '  box-shadow: 0 8px 24px var(--dsw-alias-border-l2);',
      '  overflow: hidden; font-size: 13px;',
      '}',
      '.dsh-todo-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 4px 12px; }',
      '.dsh-todo-title { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }',
      '.dsh-todo-close, .dsh-todo-del, .dsh-todo-edit-btn {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  width: 22px; height: 22px; padding: 0; border: none; border-radius: 6px;',
      '  background: transparent; color: var(--dsw-alias-label-secondary);',
      '  font: inherit; font-size: 15px; line-height: 1; cursor: pointer;',
      '}',
      '.dsh-todo-close:hover, .dsh-todo-del:hover {',
      '  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-state-error-primary);',
      '}',
      '.dsh-todo-edit-btn:hover {',
      '  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);',
      '}',
      '.dsh-todo-form { display: flex; flex-direction: column; gap: 6px; padding: 4px 12px 8px; }',
      '.dsh-todo-row { display: flex; align-items: center; gap: 6px; }',
      '.dsh-todo-input {',
      '  flex: 1 1 auto; min-width: 0; height: 30px; padding: 0 8px; box-sizing: border-box;',
      '  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;',
      '  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);',
      '  font: inherit; font-size: 13px; outline: none;',
      '}',
      '.dsh-todo-input::placeholder { color: var(--dsw-alias-label-secondary); }',
      '.dsh-todo-input:focus, .dsh-todo-due:focus { border-color: var(--dsw-alias-brand-primary); }',
      '.dsh-todo-due {',
      '  flex: 1 1 auto; min-width: 0; height: 26px; padding: 0 6px; box-sizing: border-box;',
      '  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;',
      '  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary);',
      '  font: inherit; font-size: 11px; outline: none;',
      '}',
      '.dsh-todo-due-clear {',
      '  flex: none; height: 26px; padding: 0 6px; border: none; border-radius: 6px;',
      '  background: transparent; color: var(--dsw-alias-label-secondary);',
      '  font: inherit; font-size: 11px; cursor: pointer;',
      '}',
      '.dsh-todo-due-clear:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }',
      '.dsh-todo-add {',
      '  flex: none; height: 30px; padding: 0 10px;',
      '  border: 1px solid var(--dsw-alias-brand-primary); border-radius: 6px;',
      '  background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base);',
      '  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;',
      '}',
      '.dsh-todo-add:disabled { opacity: 0.5; cursor: default; }',
      '.dsh-todo-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1 1 auto; border-top: 1px solid var(--dsw-alias-border-l1); }',
      '.dsh-todo-item { position: relative; display: flex; align-items: flex-start; gap: 8px; padding: 7px 8px 7px 14px; }',
      '.dsh-todo-item + .dsh-todo-item { border-top: 1px solid var(--dsw-alias-border-l1); }',
      '.dsh-todo-item:hover { background: var(--dsw-alias-bg-layer-1); }',
      '.dsh-todo-item::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--dsw-alias-state-idle-primary); }',
      '.dsh-todo-item[data-urgency="overdue"]::before { background: var(--dsw-alias-state-error-primary); }',
      '.dsh-todo-item[data-urgency="soon"]::before { background: var(--dsw-alias-state-warn-primary); }',
      '.dsh-todo-item[data-urgency="later"]::before { background: var(--dsw-alias-state-success-primary); }',
      '.dsh-todo-item[data-urgency="none"]::before { background: var(--dsw-alias-state-success-primary); }',
      '.dsh-todo-check { flex: none; width: 14px; height: 14px; margin: 2px 0 0; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }',
      '.dsh-todo-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }',
      '.dsh-todo-text { word-break: break-word; line-height: 18px; }',
      '.dsh-todo-item.is-done .dsh-todo-text { color: var(--dsw-alias-label-secondary); text-decoration: line-through; }',
      '.dsh-todo-item.is-done::before { background: var(--dsw-alias-border-l2); }',
      '.dsh-todo-when { font-size: 11px; line-height: 14px; color: var(--dsw-alias-label-secondary); }',
      '.dsh-todo-item[data-urgency="overdue"] .dsh-todo-when { color: var(--dsw-alias-state-error-primary); font-weight: 600; }',
      '.dsh-todo-item[data-urgency="soon"] .dsh-todo-when { color: var(--dsw-alias-state-warn-primary); }',
      '.dsh-todo-item[data-urgency="later"] .dsh-todo-when { color: var(--dsw-alias-state-success-primary); }',
      '.dsh-todo-del { opacity: 0; }',
      '.dsh-todo-item:hover .dsh-todo-del, .dsh-todo-del:focus-visible { opacity: 1; }',
      '.dsh-todo-edit-btn { opacity: 0.55; }',
      '.dsh-todo-item:hover .dsh-todo-edit-btn, .dsh-todo-edit-btn:focus-visible { opacity: 1; }',
      '.dsh-todo-item.is-editing { background: var(--dsw-alias-bg-layer-1); }',
      '.dsh-todo-edit { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 6px; }',
      '.dsh-todo-edit-actions { justify-content: flex-end; }',
      '.dsh-todo-save {',
      '  flex: none; height: 26px; padding: 0 10px;',
      '  border: 1px solid var(--dsw-alias-brand-primary); border-radius: 6px;',
      '  background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base);',
      '  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;',
      '}',
      '.dsh-todo-save:disabled { opacity: 0.5; cursor: default; }',
      '.dsh-todo-empty { padding: 18px 12px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }',
      '.dsh-todo-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 12px; border-top: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); font-size: 11px; }',
      '.dsh-todo-clear { padding: 2px 6px; border: none; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer; }',
      '.dsh-todo-clear:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }',
      '.dsh-todo-chip {',
      '  flex: none; height: 26px; padding: 0 6px; white-space: nowrap;',
      '  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;',
      '  background: transparent; color: var(--dsw-alias-label-secondary);',
      '  font: inherit; font-size: 11px; cursor: pointer;',
      '}',
      '.dsh-todo-chip:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }',
      '.dsh-todo-donehead {',
      '  display: flex; align-items: center; gap: 5px; flex: none;',
      '  padding: 6px 12px; border: none; border-top: 1px solid var(--dsw-alias-border-l1);',
      '  background: transparent; color: var(--dsw-alias-label-secondary);',
      '  font: inherit; font-size: 11px; text-align: left; cursor: pointer;',
      '}',
      '.dsh-todo-donehead:hover { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }',
      '.dsh-todo-caret { font-size: 9px; line-height: 1; }',
      '.dsh-todo-list.is-done { flex: 0 1 auto; max-height: 42%; border-top: none; }',
    ].join('\n');

    function ensureStyles() {
      const existing = document.getElementById(STYLE_ID);
      if (existing) return function () {};
      const element = document.createElement('style');
      element.id = STYLE_ID;
      element.textContent = CSS;
      document.head.appendChild(element);
      return function () {
        if (element.parentNode) element.parentNode.removeChild(element);
      };
    }

    /* -------------------------------------------------------------- components */

    function TodoIcon() {
      return h(
        'svg',
        {
          width: 14,
          height: 14,
          viewBox: '0 0 16 16',
          fill: 'none',
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', {
          d: 'M2.5 4.5 4 6l3-3',
          stroke: 'currentColor',
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
        h('path', { d: 'M8.5 4.5h5', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
        h('path', {
          d: 'M2.5 10.5 4 12l3-3',
          stroke: 'currentColor',
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
        h('path', { d: 'M8.5 10.5h5', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
      );
    }

    function TodoButton() {
      const state = useStoreState();
      const buttonRef = React.useRef(null);
      const [cursor, setCursor] = React.useState(0);
      const [paused, setPaused] = React.useState(false);
      const [now, setNow] = React.useState(Date.now());

      /* Keep the urgency colour of the rotating entry current. */
      React.useEffect(function () {
        const timer = window.setInterval(function () {
          setNow(Date.now());
        }, 60000);
        return function () {
          window.clearInterval(timer);
        };
      }, []);

      function publishAnchor() {
        const node = buttonRef.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        store.setAnchor({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
      }

      React.useEffect(function () {
        publishAnchor();
        window.addEventListener('resize', publishAnchor);
        return function () {
          window.removeEventListener('resize', publishAnchor);
        };
      }, []);

      const pending = sortItems(state.items, now).filter(function (item) {
        return !item.done;
      });
      const total = pending.length;

      /* Rotate through the open to-dos unless the pointer rests on the button
         or the panel is expanded (the list is already in sight then). */
      React.useEffect(function () {
        if (total < 2 || paused || state.open) return undefined;
        const timer = window.setInterval(function () {
          setCursor(function (value) {
            return value + 1;
          });
        }, TICK_MS);
        return function () {
          window.clearInterval(timer);
        };
      }, [total, paused, state.open]);

      const activeIndex = total > 0 ? cursor % total : -1;
      const active = activeIndex >= 0 ? pending[activeIndex] : null;
      const label = active ? active.text : state.items.length ? t('allDone') : t('button');
      const urgency = active ? urgencyOf(active, now) : state.items.length ? 'done' : 'none';
      const tip = active
        ? label + ' · ' + urgencyTitle(urgency) + ' · ' + format(t('remaining'), total)
        : t('more');

      function onClick(event) {
        event.preventDefault();
        event.stopPropagation();
        publishAnchor();
        store.setOpen(!state.open);
      }

      function onMouseEnter() {
        setPaused(true);
      }

      function onMouseLeave() {
        setPaused(false);
      }

      return h(
        'button',
        {
          ref: buttonRef,
          type: 'button',
          className: 'dsh-todo-btn' + (state.open ? ' is-open' : ''),
          'data-urgency': urgency,
          title: tip,
          'aria-label': label,
          'aria-haspopup': 'dialog',
          'aria-expanded': state.open ? 'true' : 'false',
          onClick: onClick,
          onMouseEnter: onMouseEnter,
          onMouseLeave: onMouseLeave,
          onFocus: onMouseEnter,
          onBlur: onMouseLeave,
        },
        h(TodoIcon),
        active
          ? h(
              React.Fragment,
              null,
              h('span', { className: 'dsh-todo-dot', 'aria-hidden': 'true' }),
              h('span', { className: 'dsh-todo-btn-text' }, active.text),
            )
          : h('span', { className: 'dsh-todo-btn-label' }, label),
      );
    }

    function urgencyOf(item, now) {
      if (item.done) return 'done';
      if (item.due === null) return 'none';
      const diff = item.due - now;
      if (diff < 0) return 'overdue';
      if (diff <= DAY_MS) return 'soon';
      return 'later';
    }

    function urgencyTitle(urgency) {
      if (urgency === 'overdue') return t('overdue');
      if (urgency === 'soon') return t('soon');
      if (urgency === 'later') return t('later');
      return t('noDue');
    }

    function TodoPanel() {
      const state = useStoreState();
      const cardRef = React.useRef(null);
      const inputRef = React.useRef(null);
      const [draft, setDraft] = React.useState('');
      const [due, setDue] = React.useState(defaultDueInput);
      const [now, setNow] = React.useState(Date.now());
      const [showDone, setShowDone] = React.useState(loadShowDone);
      const [, bumpLayout] = React.useState(0);
      const [editingId, setEditingId] = React.useState(null);
      const [editText, setEditText] = React.useState('');
      const [editDue, setEditDue] = React.useState('');
      const editRef = React.useRef(null);
      const editingRef = React.useRef(null);
      editingRef.current = editingId;

      React.useEffect(function () {
        if (editingId && editRef.current) editRef.current.focus();
      }, [editingId]);

      React.useEffect(function () {
        const timer = window.setInterval(function () {
          setNow(Date.now());
        }, 30000);
        return function () {
          window.clearInterval(timer);
        };
      }, []);

      React.useEffect(function () {
        if (state.open && inputRef.current) inputRef.current.focus();
      }, [state.open]);

      React.useEffect(
        function () {
          if (!state.open) return undefined;
          function onKeyDown(event) {
            if (event.key !== 'Escape') return;
            /* An open inline editor consumes Escape first. */
            if (editingRef.current) return;
            store.setOpen(false);
          }
          function onLayoutChange() {
            bumpLayout(function (value) {
              return value + 1;
            });
          }
          document.addEventListener('keydown', onKeyDown, true);
          window.addEventListener('resize', onLayoutChange);
          return function () {
            document.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('resize', onLayoutChange);
          };
        },
        [state.open],
      );

      if (!state.open) return null;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const anchor = state.anchor;

      /* Narrow windows (or a narrow sidebar) must not push the card off-screen. */
      const cardWidth = Math.min(CARD_WIDTH, Math.max(220, viewportWidth - GAP * 2));
      let left = anchor ? anchor.left : viewportWidth - cardWidth - GAP;
      left = Math.max(GAP, Math.min(left, viewportWidth - cardWidth - GAP));
      let top = anchor ? anchor.bottom + GAP : 56;
      const maxHeight = Math.max(180, viewportHeight - top - GAP);
      /* An explicit height keeps the list area from collapsing to nothing,
         which would leave only the header row of the card visible. */
      const cardHeight = Math.min(420, maxHeight);

      const sorted = sortItems(state.items, now);
      const pendingItems = sorted.filter(function (item) {
        return !item.done;
      });
      const doneItems = sorted.filter(function (item) {
        return item.done;
      });
      const pending = pendingItems.length;
      const hasDone = doneItems.length > 0;

      function onSubmit(event) {
        event.preventDefault();
        store.add(draft, fromLocalInput(due));
        setDraft('');
        if (inputRef.current) inputRef.current.focus();
      }

      function toggleShowDone() {
        const next = !showDone;
        setShowDone(next);
        saveShowDone(next);
      }

      function startEdit(item) {
        setEditingId(item.id);
        setEditText(item.text);
        setEditDue(item.due === null ? '' : toLocalInput(item.due));
      }

      function stopEdit() {
        setEditingId(null);
      }

      function saveEdit() {
        if (!editingId) return;
        store.updateItem(editingId, { text: editText, due: fromLocalInput(editDue) });
        setEditingId(null);
      }

      function renderItem(item) {
        const urgency = urgencyOf(item, now);
        const when = item.due === null ? t('noDue') : formatDue(item.due);
        if (item.id === editingId) {
          return h(
            'li',
            { key: item.id, className: 'dsh-todo-item is-editing', 'data-urgency': urgency },
            h(
              'div',
              { className: 'dsh-todo-edit' },
              h('input', {
                ref: editRef,
                className: 'dsh-todo-input',
                value: editText,
                'aria-label': t('editText'),
                onChange: function (event) {
                  setEditText(event.target.value);
                },
                onKeyDown: function (event) {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveEdit();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    stopEdit();
                  }
                },
              }),
              h(
                'div',
                { className: 'dsh-todo-row' },
                h('input', {
                  type: 'datetime-local',
                  className: 'dsh-todo-due',
                  value: editDue,
                  'aria-label': t('editDueHint'),
                  onChange: function (event) {
                    setEditDue(event.target.value);
                  },
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-todo-due-clear',
                    onClick: function () {
                      setEditDue('');
                    },
                  },
                  t('clearDue'),
                ),
              ),
              h(
                'div',
                { className: 'dsh-todo-row dsh-todo-edit-actions' },
                h('button', { type: 'button', className: 'dsh-todo-due-clear', onClick: stopEdit }, t('cancel')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-todo-save',
                    disabled: !editText.trim(),
                    onClick: saveEdit,
                  },
                  t('save'),
                ),
              ),
            ),
          );
        }
        return h(
          'li',
          {
            key: item.id,
            className: 'dsh-todo-item' + (item.done ? ' is-done' : ''),
            'data-urgency': urgency,
          },
          h('input', {
            type: 'checkbox',
            className: 'dsh-todo-check',
            checked: item.done,
            'aria-label': item.text,
            onChange: function () {
              store.toggleItem(item.id);
            },
          }),
          h(
            'div',
            { className: 'dsh-todo-main' },
            h(
              'span',
              {
                className: 'dsh-todo-text',
                title: item.text,
                onDoubleClick: function () {
                  startEdit(item);
                },
              },
              item.text,
            ),
            h('span', { className: 'dsh-todo-when', title: urgencyTitle(urgency) }, when),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-todo-edit-btn',
              title: t('edit'),
              'aria-label': t('edit'),
              onClick: function () {
                startEdit(item);
              },
            },
            '✎',
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-todo-del',
              title: t('deleteItem'),
              'aria-label': t('deleteItem'),
              onClick: function () {
                store.remove(item.id);
              },
            },
            '×',
          ),
        );
      }

      /**
       * Pending to-dos first, then an expandable "done" section so finished
       * items never bury the ones that still need attention.
       */
      function itemsView() {
        if (state.items.length === 0) {
          return h('div', { className: 'dsh-todo-empty' }, t('empty'));
        }
        const rows = [];
        if (pendingItems.length === 0) {
          rows.push(h('div', { key: 'all-done', className: 'dsh-todo-empty' }, t('allDone')));
        } else {
          rows.push(h('ul', { key: 'pending', className: 'dsh-todo-list' }, pendingItems.map(renderItem)));
        }
        if (hasDone) {
          rows.push(
            h(
              'button',
              {
                key: 'done-head',
                type: 'button',
                className: 'dsh-todo-donehead',
                title: showDone ? t('hideDone') : t('showDone'),
                'aria-expanded': showDone ? 'true' : 'false',
                onClick: toggleShowDone,
              },
              h('span', { className: 'dsh-todo-caret', 'aria-hidden': 'true' }, showDone ? '▾' : '▸'),
              h('span', null, format(t('doneSection'), doneItems.length)),
            ),
          );
          if (showDone) {
            rows.push(h('ul', { key: 'done', className: 'dsh-todo-list is-done' }, doneItems.map(renderItem)));
          }
        }
        return rows;
      }

      return h(
        'div',
        { className: 'dsh-todo-layer' },
        h(
          'div',
          {
            ref: cardRef,
            className: 'dsh-todo-card',
            style: {
              left: left + 'px',
              top: top + 'px',
              width: cardWidth + 'px',
              height: cardHeight + 'px',
              maxHeight: maxHeight + 'px',
            },
            role: 'dialog',
            'aria-label': t('title'),
          },
          h(
            'div',
            { className: 'dsh-todo-head' },
            h('span', { className: 'dsh-todo-title' }, t('title')),
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-todo-close',
                title: t('close'),
                'aria-label': t('close'),
                onClick: function () {
                  store.setOpen(false);
                },
              },
              '×',
            ),
          ),
          h(
            'form',
            { className: 'dsh-todo-form', onSubmit: onSubmit },
            h(
              'div',
              { className: 'dsh-todo-row' },
              h('input', {
                ref: inputRef,
                className: 'dsh-todo-input',
                type: 'text',
                value: draft,
                placeholder: t('placeholder'),
                'aria-label': t('placeholder'),
                onChange: function (event) {
                  setDraft(event.target.value);
                },
              }),
              h('button', { type: 'submit', className: 'dsh-todo-add', disabled: !draft.trim() }, t('add')),
            ),
            h(
              'div',
              { className: 'dsh-todo-row' },
              h('input', {
                className: 'dsh-todo-due',
                type: 'datetime-local',
                value: due,
                title: t('dueHint'),
                'aria-label': t('dueHint'),
                onChange: function (event) {
                  setDue(event.target.value);
                },
              }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-todo-due-clear',
                  onClick: function () {
                    setDue('');
                  },
                },
                t('clearDue'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-todo-chip',
                  onClick: function () {
                    setDue(quickDueInput('today'));
                  },
                },
                t('today'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-todo-chip',
                  onClick: function () {
                    setDue(quickDueInput('tomorrow'));
                  },
                },
                t('tomorrow'),
              ),
            ),
          ),
          itemsView(),
          h(
            'div',
            { className: 'dsh-todo-foot' },
            h('span', null, format(t('remaining'), pending)),
            hasDone
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-todo-clear',
                    onClick: function () {
                      store.clearDone();
                    },
                  },
                  t('clearDone'),
                )
              : null,
          ),
        ),
      );
    }

    /* ------------------------------------------------------------------ plugin */

    function setupLocale(ctx) {
      try {
        const locale = ctx.get('locale');
        if (!locale || typeof locale.register !== 'function') return null;
        const disposers = [];
        disposers.push(locale.register('dsh-todo', 'en', EN));
        disposers.push(locale.register('dsh-todo', 'zh', ZH));
        if (typeof locale.bind === 'function') translate = locale.bind('dsh-todo');
        return function () {
          disposers.forEach(function (dispose) {
            if (typeof dispose === 'function') dispose();
          });
        };
      } catch (error) {
        console.warn('[dsh-todo] locale service unavailable:', error);
        return null;
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const disposeLocale = setupLocale(ctx);
        const disposeStyles = ensureStyles();
        if (typeof ctx.effect === 'function') {
          ctx.effect(function () {
            return function () {
              if (typeof disposeLocale === 'function') disposeLocale();
              disposeStyles();
            };
          });
        }

        // Leftmost seat of the right-aligned header button group.
        ctx.slots.inject('conversation.session.header.utilities', function () {
          return ctx.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'dsh-todo:button',
              order: -20,
              label: 'To-dos',
            },
            TodoButton,
          );
        });

        ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-todo:panel',
              order: 900,
              label: 'To-dos panel',
            },
            TodoPanel,
          );
        });
      },
    };
  },
});
