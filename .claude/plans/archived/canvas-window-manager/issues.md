# pill dock / window ui issues

- two types of menus:
  - non-closing: like save, etc; cannot close, only minimize to dock
  - closing: can close, the rest.

- the menus should have these states:
  - closed: window hidden; pill hidden (default state)
  - opened: pill is shown in dock
    - minimized: window is hidden entirely
    - docked: windows attached to side
    - floating: window is free floating

- the dock:
  - attached to vertical anchor side
  - expand down from horizontal anchor; overflows/clips off page if too many
  - rearranging docked menus:
    - click and drag on the titlebar
    - should collapse all docked windows to just the titlebars
    - show a line indicator between the two it would be placed in-between.

- each pill:
  - two parts, in this order: icon (required) and text (optional)
  - corresponds to a specific window, every open window gets a pill
  - clicking on a pill:
    - if closed: opens the window in the dock
    - if minimized: opens the window in the last state
    - if docked: moves to front of dock
    - if floating: makes window active, brings to front; if already active, minimize instead

- the window:
  - switch to these icons / buttons in this order:
    - pop/dock: use arrow-up-right for pop out; arrow-down-left for re-dock
    - minimize: use chevron-up for minimize;
    - close: use x;
  - icons should have a very thick stroke
  - add our own circle behind them: red for close on normal menus; orange for minimize on docked; nuetral color the others; highlight/darken on hover based on theme;
  - the titlebar and content should just have a thin line to divide; no nested rects; no extra padding/margin
  - all windows are the same width docked, or that width minimum when undocked

- the corner of the screen it's anchored in should be configurable;
- the dock and windows should consistently implement the 110% font scale up that the rest of the UI got for text and icons.
- the active window highlight only appear briefly when the window changes states i.e. is dragged, is docked, minimized, or clicked into.
- use text transform to make all window titles lowercase
- all the menus should have a consistent UI. tabs, lists, buttons, section headers, text boxes, drop downs etc

---

## future plans

The config, about, import, auth, open, etc dialogs each need to be migrated to windows.
potentially in a separate mode thats locked as: undocked, centered, and with a background blur.
