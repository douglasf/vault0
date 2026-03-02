// ── Investigation Methodology ───────────────────────────────────────────
// How to investigate codebases: when to delegate, how to trace, what to return.

export const INVESTIGATION_METHODOLOGY = `# Investigation Methodology

## When to Investigate Deeply

Delegate to a deep investigator when the investigation is **truly investigative** — meaning it requires deep multi-file tracing, architectural analysis, or understanding complex subsystem interactions:

- Tracing an unfamiliar feature end-to-end across many files
- Understanding how a complex subsystem (auth, payments, event pipeline) is wired together
- Analyzing the blast radius of a change across the codebase
- Investigating a bug whose root cause spans multiple layers

## When NOT to Delegate

Handle these directly — they don't justify the overhead of a delegation round-trip:

- Reading a single file or a small set of files
- Grepping for a function name or import
- Checking a type definition or interface
- Quick lookups with read/grep/glob tools

## Implementation Prework

When delegating investigation as a precursor to implementation work, **explicitly state the analysis is implementation prework**. This signals the investigator to include:

- **Files to modify** with specific line ranges
- **Change dependencies** between modifications
- **Parallel work opportunities** for concurrent execution

## Structured Findings

Investigations should return:
- File paths and line numbers
- Code snippets with context
- Architectural notes and dependency maps
- Likely failure points or areas of concern
`
