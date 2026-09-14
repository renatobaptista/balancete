# Landing/Login Showcase — Design

**Goal:** Turn the bare login screen into a small landing page — the login/signup card stays at the top exactly as it works today, and a feature showcase is added below it so a logged-out visitor immediately understands what Balancete does.

**Scope:** `src/Auth.jsx` only. No routing, no new pages, no new data. Logged-in users never see this (unchanged: `src/main.jsx` already renders `<Auth/>` only when there's no session).

## Layout

Single scrolling page, same component:

1. **Top — login/signup card** (unchanged behavior): title, subtitle, the 🚧 in-development banner + contact e-mail (already shipped), e-mail/senha fields, Entrar/Criar conta. Stays narrow and centered (`max-width: 420px`), exactly as today.
2. **Below — feature showcase**: a wider section (not constrained to 420px) with 6 tiles, 2-3 per row on desktop, stacking to 1 column on narrow viewports. Each tile: an icon (reuse `lucide-react`, already a dependency), a short bold title, one sentence of copy.

Tiles (title — copy), in this order:
1. **Lançamentos completos** — Entradas, saídas, investimentos e transferências, incluindo compras parceladas.
2. **Categorias flexíveis** — Organize do seu jeito, com categorias e subcategorias.
3. **Contas e cartões** — Contas correntes e cartões de crédito, em real ou dólar.
4. **Metas** — Limite de gastos por categoria e meta de investimento.
5. **Relatório mês a mês** — Acompanhe a evolução dos seus números ao longo do tempo.
6. **Importação de planilha** — Traga anos de histórico de outro app financeiro.

## Visual style

Reuse the exact CSS custom properties already defined in `Auth.jsx`'s `<style>` block (`--paper`, `--paper-card`, `--ink`, `--ink-soft`, `--rule`, `--rule-strong`, `--income`, `--expense`) — no new palette. Tiles use `--paper-card` background with a `--rule` border, matching the existing `.bc-auth-card` treatment, so the showcase reads as part of the same product rather than a bolted-on marketing page.

## Out of scope

- No routing/multi-page navigation.
- No CMS/editable content — copy is hardcoded in the component, same as the rest of the app's UI text.
- No new automated tests (this codebase's only automated tests are the pure `src/lib/mappers.js` unit tests; this is presentational JSX, verified by hand in the Browser pane like every other UI change made this session).
