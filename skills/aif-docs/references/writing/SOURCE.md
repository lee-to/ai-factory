# SimpleEn-RU source and adaptation

- Source: [freeunitdev/ai-SimpleEn-RU](https://github.com/freeunitdev/ai-SimpleEn-RU).
- Reviewed revision: `aefcd51664f549801758bd5530d9e0f6bba415fc`.
- English rules: [simple-english/SKILL.md](https://github.com/freeunitdev/ai-SimpleEn-RU/blob/aefcd51664f549801758bd5530d9e0f6bba415fc/skills/simple-english/SKILL.md).
- Russian rules: [simple-russian/SKILL.md](https://github.com/freeunitdev/ai-SimpleEn-RU/blob/aefcd51664f549801758bd5530d9e0f6bba415fc/skills/simple-russian/SKILL.md).
- License: MIT, Copyright (c) 2026 AminBlg; full notice in `LICENSE.md`.

AI Factory adapts structural guidance into local RU/EN references, loaded only
by `/aif-docs` for explicitly selected artifacts. It does not install the
upstream skills, system prompts, lints, or inference benchmarks. There is no
runtime download dependency.

Intentional departures from upstream: do not convert modals, replace project
terminology, infer commands from conditions, invent incident facts, or apply
the rules to prompts, issues, commits, application messages, and all chat
answers. Meaning preservation and project dictionary decisions take priority
over sentence length and vocabulary heuristics.

The source describes ГОСТ Р 58049-2017 and ASD-STE100. This adaptation is an
unofficial editorial aid; it makes no certification or endorsement claim and
does not reproduce either official standard or the ASD dictionary. The proposal's
reported −71% EN / −55% RU lint-hit reductions are upstream heuristic metrics,
not locally reproduced results or evidence of fewer technical errors.
