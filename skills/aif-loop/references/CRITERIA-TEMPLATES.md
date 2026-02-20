# Criteria Templates

Starting-point rule sets for common task types. Used during Interactive Setup to generate initial rules.

Templates are shorthand for fast setup. Before iteration starts, rows must be normalized into full runtime rule objects (`id`, `description`, `severity`, `weight`, `phase`, `check`) and saved to `run.json.criteria.rules`.

If template row omits `weight`, derive from severity:
- `fail` -> `2`
- `warn` -> `1`
- `info` -> `0`

## API Specification

For tasks producing OpenAPI specs, REST API designs, or endpoint documentation.

**Recommended threshold:** A=0.8, B=0.9

### Rules

| ID | Description | Severity | Phase | Check |
|----|-------------|----------|-------|-------|
| `a.correctness.endpoints` | All required endpoints are present with correct HTTP methods | fail | A | Verify required paths and HTTP methods from task prompt exist in artifact |
| `a.correctness.schemas` | Request/response schemas match the domain model | fail | A | Verify each operation has request/response schema definitions aligned with domain entities |
| `a.completeness.examples` | At least one JSON example per endpoint | fail | A | Verify every endpoint contains at least one JSON example payload |
| `a.completeness.errors` | Error responses defined (400, 404, 500 at minimum) | warn | A | Verify standard error responses include 400, 404, and 500 where applicable |
| `b.style.naming` | Consistent naming convention across paths and parameters | warn | B | Verify one naming convention is used consistently across paths and parameters |
| `b.completeness.pagination` | List endpoints include pagination parameters | warn | B | Verify list endpoints define pagination fields (page/limit or cursor) |
| `b.completeness.auth` | Authentication/authorization requirements documented | fail | B | Verify security schemes and operation-level auth requirements are documented |
| `b.quality.descriptions` | All operations have clear descriptions | warn | B | Verify each operation has non-empty summary or description |

## Code Generation

For tasks producing source code, implementations, or scripts.

**Recommended threshold:** A=0.8, B=0.9

### Rules

| ID | Description | Severity | Phase | Check |
|----|-------------|----------|-------|-------|
| `a.correctness.compiles` | Code compiles/parses without errors | fail | A | Run compile or parse command for target stack and require success |
| `a.correctness.logic` | Core business logic matches requirements | fail | A | Verify implemented behavior covers required scenarios from task prompt |
| `a.completeness.functions` | All required functions/methods are present | fail | A | Verify all required public functions/classes/methods are implemented |
| `a.completeness.types` | Type annotations present where required | warn | A | Verify required type signatures or annotations are present |
| `b.quality.error-handling` | Proper error handling for edge cases | warn | B | Verify edge-case and failure-path handling exists for critical flows |
| `b.quality.logging` | Logging at appropriate levels | warn | B | Verify key operations emit logs at appropriate levels |
| `b.style.conventions` | Follows project coding conventions | warn | B | Verify naming/style/formatting matches project conventions |
| `b.security.input-validation` | Input validation on public interfaces | fail | B | Verify external inputs are validated and rejected when invalid |

## Documentation

For tasks producing technical docs, guides, or reference material.

**Recommended threshold:** A=0.75, B=0.85

### Rules

| ID | Description | Severity | Phase | Check |
|----|-------------|----------|-------|-------|
| `a.correctness.accuracy` | Technical content is factually accurate | fail | A | Verify statements match project code/config and known constraints |
| `a.completeness.sections` | All required sections are present | fail | A | Verify all required headings/sections from task prompt are present |
| `a.completeness.examples` | Code examples included where referenced | warn | A | Verify referenced examples/snippets are present and complete |
| `a.quality.clarity` | Writing is clear and unambiguous | warn | A | Verify instructions are concrete, unambiguous, and actionable |
| `b.quality.structure` | Logical flow and heading hierarchy | warn | B | Verify heading hierarchy and section order form a coherent flow |
| `b.completeness.cross-refs` | Cross-references and links are valid | warn | B | Verify internal/external links resolve and referenced sections exist |
| `b.style.consistency` | Consistent terminology and formatting | warn | B | Verify terminology and formatting are consistent across the document |
| `b.quality.audience` | Appropriate for target audience level | warn | B | Verify depth and terminology match intended audience skill level |

## Configuration

For tasks producing config files, infrastructure definitions, or environment setups.

**Recommended threshold:** A=0.8, B=0.9

### Rules

| ID | Description | Severity | Phase | Check |
|----|-------------|----------|-------|-------|
| `a.correctness.syntax` | Valid syntax for the target format (YAML, JSON, TOML, etc.) | fail | A | Validate file syntax with parser/linter for target format |
| `a.correctness.required` | All required fields are present | fail | A | Verify mandatory keys/sections for target system are present |
| `a.completeness.env-vars` | All referenced environment variables are documented | warn | A | Verify each referenced env var is documented with purpose/default |
| `a.security.no-secrets` | No hardcoded secrets or credentials | fail | A | Verify no embedded secrets/tokens/passwords in configuration |
| `b.quality.defaults` | Sensible default values for optional fields | warn | B | Verify optional settings have safe and practical defaults |
| `b.completeness.comments` | Inline comments explaining non-obvious settings | warn | B | Verify non-obvious config values include concise inline explanation |
| `b.quality.portability` | Works across target environments | warn | B | Verify environment-specific assumptions are parameterized/documented |
| `b.security.permissions` | Appropriate file/resource permissions | warn | B | Verify permissions follow least-privilege for sensitive resources |
