---
name: aif-roadmap
description: Create or update a project roadmap with major milestones. Generates .ai-factory/ROADMAP.md — a strategic checklist of high-level goals. Use when user says "roadmap", "project plan", "milestones", or "what to build next".
argument-hint: "[check | project vision or requirements]"
allowed-tools: Read Write Edit Glob Grep Bash(git *) AskUserQuestion Questions
disable-model-invocation: true
---

# Roadmap - Strategic Project Planning

Create and maintain a high-level project roadmap with major milestones.

## Workflow

### Step 0: Load Project Context

**Read `.ai-factory/DESCRIPTION.md`** if it exists to understand:
- Tech stack (language, framework, database, ORM)
- Project architecture and conventions
- Non-functional requirements

**Read `.ai-factory/ARCHITECTURE.md`** if it exists to understand:
- Chosen architecture pattern and folder structure
- Module boundaries and communication patterns

### Step 1: Determine Mode

If argument is `check` → Mode 3: Check Progress (requires ROADMAP.md)

Otherwise check if `.ai-factory/ROADMAP.md` exists:
- **Does NOT exist** → Mode 1: Create Roadmap
- **Exists** → Mode 2: Update Roadmap

---

### Mode 1: Create Roadmap (First Run)

**1.1: Gather Input**

If user provided arguments (vision/description):
- Use as primary input for milestones

If no arguments:
- Ask interactively:

```
AskUserQuestion: What are the major goals for this project?

Options:
1. Let me describe the vision
2. Analyze codebase and suggest milestones
3. Both — I'll describe, you'll add what's missing
```

If user chooses to describe → ask follow-up:

```
AskUserQuestion: Any priorities or deadlines?

Options:
1. Yes, let me specify
2. No, just order by logical sequence
3. Skip — I'll reprioritize later
```

**1.2: Explore Codebase**

Scan the project to understand what's already built:
- `Glob` for project structure (key directories, modules)
- `Grep` for implemented features (routes, models, services)
- Check git log for completed work: `git log --oneline -20`

**1.3: Generate ROADMAP.md**

Create `.ai-factory/ROADMAP.md` with this format:

```markdown
# Project Roadmap

> <project vision — one-liner from DESCRIPTION.md or user input>

## Milestones

- [ ] **Milestone Name** — short description of what this achieves
- [ ] **Milestone Name** — short description of what this achieves
- [x] **Milestone Name** — short description (already done based on codebase analysis)

## Completed

| Milestone | Date |
|-----------|------|
| Milestone Name | YYYY-MM-DD |
```

**Rules for milestones:**
- Each milestone is a **high-level goal**, not a granular task (that's `/aif-plan`)
- 5-15 milestones is the sweet spot — fewer means too vague, more means too granular
- Order by logical sequence (dependencies first)
- Mark already-completed milestones as `[x]` and add them to the Completed table
- Use today's date for milestones detected as already done

**1.4: Confirm with user**

Show the generated roadmap and ask:

```
AskUserQuestion: Here's the proposed roadmap. What would you like to do?

Options:
1. Looks good — save it
2. Add more milestones
3. Remove/modify some milestones
4. Rewrite — let me give better input
```

Apply changes if requested, then save to `.ai-factory/ROADMAP.md`.

---

### Mode 2: Update Roadmap (Subsequent Run)

**2.1: Read Current State**

- Read `.ai-factory/ROADMAP.md`
- Read `.ai-factory/DESCRIPTION.md` for context
- Explore codebase briefly to check what's changed since last update

**2.2: Determine Action**

If user provided arguments (new milestones/changes):
- Apply the requested changes directly

If no arguments:
- Analyze current state and present options:

```
AskUserQuestion: What would you like to do with the roadmap?

Options:
1. Review progress — check what's done, mark completed milestones
2. Add new milestones
3. Reprioritize — reorder existing milestones
4. Rewrite — major revision of the roadmap
```

**2.3: Review Progress (if chosen)**

- Scan codebase for evidence of completed milestones
- For each unchecked milestone, check if the work appears done
- Propose marking completed milestones:

```
These milestones appear to be done:
- **Milestone Name** — [evidence: files exist, routes implemented, etc.]

Mark them as completed?
```

If confirmed:
- Change `- [ ]` to `- [x]` in the Milestones section
- Add entry to Completed table with today's date
- Move completed milestones below unchecked ones (or keep in place — user preference)

**2.4: Add New Milestones (if chosen)**

- Ask user to describe new milestones
- Insert them in logical order among existing milestones
- Update `.ai-factory/ROADMAP.md`

**2.5: Reprioritize (if chosen)**

- Show current order
- Ask user for new order or let them describe priority changes
- Reorder milestones in `.ai-factory/ROADMAP.md`

**2.6: Save Changes**

Update `.ai-factory/ROADMAP.md` with all modifications.

Show summary:
```
## Roadmap Updated

Total milestones: N
Completed: X/N
Next up: **Milestone Name**

To start working on the next milestone:
/aif-plan <milestone description>  → creates branch + plan
/aif-implement                     → executes the plan
```

---

### Mode 3: Check Progress (`/aif-roadmap check`)

Automated scan — analyze the codebase and mark completed milestones without interactive questions.

**Requires** `.ai-factory/ROADMAP.md` to exist. If it doesn't — tell the user to run `/aif-roadmap` first.

**3.1: Read roadmap and project context**

- Read `.ai-factory/ROADMAP.md`
- Read `.ai-factory/DESCRIPTION.md` for tech stack context

**3.2: Analyze each unchecked milestone**

For every `- [ ]` milestone:
- Determine what evidence would prove it's done (files, routes, models, configs, tests)
- Use `Glob` and `Grep` to search for that evidence
- Check `git log --oneline --all -30` for related commits
- Score: **done** (strong evidence), **partial** (some work started), **not started**

**3.3: Report findings**

```
## Roadmap Progress Check

✅ Done (ready to mark):
- **User Authentication** — found: src/auth/, JWT middleware, login/register routes
- **Database Setup** — found: migrations/, models/, seed scripts

🔨 In Progress:
- **Payment Integration** — found: src/payments/ exists but Stripe webhook handler missing

⏳ Not Started:
- **Admin Dashboard**
- **Email Notifications**

Mark completed milestones? (2 milestones)
```

**3.4: Apply changes (if confirmed)**

- Mark done milestones `[x]`
- Add entries to Completed table with today's date
- Leave partial and not-started milestones unchanged

Show updated summary:
```
Completed: X/N milestones
Next up: **Milestone Name**
```

---

## ROADMAP.md Format

```markdown
# Project Roadmap

> <project vision — one-liner>

## Milestones

- [ ] **Name** — short description
- [ ] **Name** — short description
- [x] **Name** — short description

## Completed

| Milestone | Date |
|-----------|------|
| Name | YYYY-MM-DD |
```

## Critical Rules

1. **Milestones are high-level** — each represents a major feature or capability, not a task
2. **ROADMAP.md is the source of truth** — always read before modifying
3. **Never remove milestones silently** — always confirm with user before removing
4. **Completed table tracks history** — every checked milestone gets a date entry
5. **NO implementation** — this skill only plans, use `/aif-plan` to start a feature and `/aif-implement` to execute
