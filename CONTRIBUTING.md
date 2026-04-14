# Contributing to Metra

Thanks for your interest in making Metra better. This project is small on purpose — contributions that keep it lean are the most welcome.

## Ground rules

- **Keep the dependency footprint near zero.** Metra is meant to drop into any LLM app without pulling the world.
- **Preserve semantic meaning.** Any new compression rule must not change what the model is being asked to do.
- **Benchmark before you ship.** If you add a transform, include a before/after token delta in the PR description.

## Development

```bash
git clone https://github.com/metra-sdk/metra.git
cd metra
npm install
npm run build
```

During development:

```bash
npm run dev      # tsup watch
```

## Pull requests

1. Fork and branch from `main`.
2. Keep PRs focused — one feature or fix per PR.
3. Update the README if you change public API.
4. Add or update tests where applicable.

## Filing issues

When reporting a bug, include:

- The input prompt (or a minimal reproduction)
- What you expected
- What you got
- Metra version and Node version

## Code style

- TypeScript strict mode, no `any` unless justified.
- No comments that merely restate the code.
- Prefer pure functions; keep state in `Context`.

## License

By contributing, you agree your contributions will be licensed under the MIT License.
