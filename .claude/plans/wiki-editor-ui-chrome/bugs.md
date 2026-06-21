# bugs — wiki-editor-ui-chrome

## open

- [nit] no `.prettierignore` in wiki-editor — dist/ files get reformatted on every lint run, adding noise to diffs → defer · low friction, fix alongside build-pipeline phase which will own dist/ output
- [important] `let editor: { undoEdit; redoEdit }` is a hand-written interface that drifts if Editor.svelte's exports change → fix-in-wiki-editor-text-editor · text-editor phase establishes the canonical editor API; update the binding there

## closed
