# no-crows-tools

A small collection of simple, browser-based tools, hosted as a static GitHub Pages site. Everything runs locally in the browser — nothing is uploaded.

## Coding Rules

- Only modify source files; never modify generated files, build output, or project metadata unless explicitly requested
- Code must be concise and minimal
- Little or no comments; if present, all lowercase, no emojis
- Modular and extensible architecture
- No hardcoding or shortcut design choices that compromise future flexibility
- Vanilla HTML/CSS/JS only — no frameworks, build steps, or external dependencies; everything must run by opening a file in the browser
- All processing stays client-side; never upload or send user files anywhere

## Coding Style

- `camelCase` for variables, functions, and parameters
- `THIS_IS_A_CONSTANT` for constants
- `kebab-case` for file names, directories, css classes, and ids
- Braces on the same line (K&R style)
- One statement per line
- `const` by default; `let` only when reassignment is needed; never `var`
- Use `===`/`!==`, never `==`/`!=`
- No unused variables or imports
- Functions have a single-line comment description above them

```javascript
// returns the file name without its .png extension
function baseName(name) {
  return name.replace(/\.png$/i, '');
}
```

## Project Structure

- `index.html` + `style.css` — landing page and tool directory
- `tools/<tool-name>/` — one self-contained folder per tool (`index.html`, `style.css`, plus its js)
- Each tool links back to the landing page; the landing page lists every tool
- `.nojekyll` — serve all files as-is on GitHub Pages
- All links are relative so the site works both as local files and under the Pages subpath

## Adding a Tool

- Create a new folder under `tools/` with its own `index.html`, `style.css`, and js
- Add one entry to the directory list in the root `index.html`
- Keep each tool self-contained, no shared runtime dependencies between tools

## Tool Descriptions

- Concise and clear; the point of the tool should be obvious from it
- No em-dashes
- No superfluous info; omit anything implied by the tool itself (e.g. that it runs in the browser or does not upload files)

## Site Concept

- A casual hub of small single-purpose utilities, each doing one thing well
- Tools are fully client-side and privacy-respecting — files never leave the user's machine
- Simple, plain styling; clarity over polish

## Git Rules

- Commit messages must be concise and minimal
- No emojis
- No AI crediting
