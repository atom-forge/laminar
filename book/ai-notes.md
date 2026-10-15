# AI Notes

A coding agent works best when it reads the documentation of the package first and knows the decisions your project has already made. Copy the fenced block below into the instruction file of your project (for example `AGENTS.md`) and replace every `<...>` field with a fact you have verified in your application.

## Purpose

Read the library documentation first, then supply the actual application's layer
map separately. Layer names, paths, and dependency directions are not universal
Laminar requirements.

## Copyable instructions

```markdown
## AtomForge Laminar

Before defining, changing, or assembling layers with `@atom-forge/laminar`,
start with `node_modules/@atom-forge/laminar/README-AI.md` at the package root,
then follow its pointers to the task-relevant documentation. Follow dependency
symlinks to the library repository when present. Use documentation matching the
installed version; Markdown filesystem paths are not package import subpaths.

Read the relevant guidance for layer definitions, resolver arguments, factory
assembly, public boundaries, initialization, and disposal before implementation.
Verify the exported API instead of treating names used in documentation examples
as package exports.

In this project, the layers are described below. This is project configuration,
not a built-in Laminar layer scheme:

| Layer | Definition / assembly location | Responsibility | Allowed dependencies | Public boundary |
| --- | --- | --- | --- | --- |
| <LAYER_NAME> | <PROJECT_LOCATION> | <RESPONSIBILITY> | <DEPENDENCIES> | <EXPOSED_CONTRACT> |

Composition entrypoint: <COMPOSITION_LOCATION>
Initialization and disposal owner: <LIFECYCLE_OWNER>
Dependency / startup ordering: <ORDERING_POLICY>

Preserve this map when changing wiring. If a task requires a new boundary or
conflicts with the current map, explain the proposed change before adopting it.
Do not infer that a library feature is forbidden merely because this application
does not currently use it.
```

## Usage

Replace the angle-bracket fields with verified project facts before activating
this note. Add one row per real layer. Do not install example services, impose a
particular ORM, or assume conventional layer names. If the map is incomplete,
inspect existing composition code and ask about unresolved architecture choices.
