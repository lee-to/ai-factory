#!/usr/bin/env python3
"""
Security Scanner for Agent Skills
Detects prompt injection, data exfiltration, and malicious instructions in SKILL.md files.

Usage: python security-scan.py <path-to-skill-directory-or-SKILL.md>

Exit codes:
  0 - Clean (no threats detected)
  1 - Threats detected (BLOCKED)
  2 - Warnings detected (review recommended)
  3 - Usage error
"""

import sys
import os
import re
import base64

# ─── Colors ───────────────────────────────────────────────────────────────────

RED = '\033[0;31m'
YELLOW = '\033[1;33m'
GREEN = '\033[0;32m'
BOLD = '\033[1m'
NC = '\033[0m'

# ─── Threat Patterns ─────────────────────────────────────────────────────────
# Each pattern: (compiled_regex, severity, description)
# severity: "CRITICAL" = block install, "WARNING" = flag for review

THREAT_PATTERNS = []

def _add(pattern: str, severity: str, description: str, flags=re.IGNORECASE | re.MULTILINE):
    THREAT_PATTERNS.append((re.compile(pattern, flags), severity, description))

# ── 1. Instruction Override / Role Hijacking ──────────────────────────────────

_add(r'ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions|rules|guidelines|prompts|constraints)',
     'CRITICAL', 'Instruction override: attempts to discard prior instructions')

_add(r'disregard\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions|rules|guidelines|prompts|constraints)',
     'CRITICAL', 'Instruction override: attempts to discard prior instructions')

_add(r'forget\s+(everything|all|what)\s+(you|that)\s+(were|was|know|have been)',
     'CRITICAL', 'Instruction override: memory wipe attempt')

_add(r'(you\s+are\s+now|from\s+now\s+on\s+you\s+are|pretend\s+(to\s+be|you\s+are)|act\s+as\s+if\s+you\s+are|roleplay\s+as)\s+(?!an?\s+(expert|professional|experienced)\s+(skill|agent|developer|engineer))',
     'CRITICAL', 'Role hijacking: attempts to override agent identity')

_add(r'new\s+(system\s+)?(instructions|rules|prompt|role)\s*:',
     'CRITICAL', 'Instruction injection: defines new system-level instructions')

_add(r'<\s*system\s*>|<\s*/?\s*system-?(message|prompt|instruction)\s*>',
     'CRITICAL', 'Fake system tag: injects fake system-level XML tags')

_add(r'SYSTEM\s*:\s*you\s+(are|must|should|will|have)',
     'CRITICAL', 'Fake system prefix: impersonates system-level messages')

_add(r'override\s+(all\s+)?(safety|security|restriction|constraint|limitation|guardrail|filter)',
     'CRITICAL', 'Safety bypass: attempts to disable safety mechanisms')

# ── 2. Data Exfiltration ──────────────────────────────────────────────────────

_add(r'(curl|wget|fetch|http\.request|urllib|requests\.(get|post))\s+.{0,50}(\.env|credentials|secret|token|password|api.?key|private.?key)',
     'CRITICAL', 'Data exfiltration: sends sensitive files/variables to external URL')

_add(r'(curl|wget)\s+(-[a-zA-Z]\s+)*https?://(?!skills\.sh|github\.com|npmjs\.com|registry\.npmjs\.org)',
     'WARNING', 'External HTTP request: sends data to unknown external URL')

_add(r'(cat|read|type)\s+.{0,30}(\.env|credentials|\.ssh|\.aws|\.gnupg|id_rsa|\.netrc|\.npmrc)',
     'CRITICAL', 'Credential access: reads sensitive credential files')

_add(r'\$\{?(HOME|USER|LOGNAME|HOSTNAME)\}?.{0,20}(\.env|\.ssh|\.aws|\.config|\.gnupg|secret|credential|token)',
     'CRITICAL', 'Credential path traversal: constructs paths to sensitive files')

_add(r'(send|post|upload|transmit|exfiltrate|leak)\s+.{0,40}(secret|credential|token|password|key|\.env|private)',
     'CRITICAL', 'Explicit exfiltration: instructions to send sensitive data')

_add(r'base64\s+(encode|decode)\s+.{0,30}(secret|credential|token|password|key|\.env)',
     'CRITICAL', 'Encoded exfiltration: encodes sensitive data for extraction')

# ── 3. Stealth / Deception ────────────────────────────────────────────────────

_add(r'(do\s+not|don\'?t|never|must\s+not)\s+(tell|inform|show|reveal|display|mention|alert|warn|notify)\s+(the\s+)?(user|human|operator)',
     'CRITICAL', 'Stealth instruction: hides actions from user')

_add(r'(secretly|covertly|without\s+(the\s+)?user\s+(knowing|noticing|seeing))',
     'CRITICAL', 'Stealth modifier: performs actions without user awareness')

_add(r'(silently|quietly)\s+(execute|run|delete|remove|send|install|modify|write|overwrite|change|access|read|upload|transmit|exfiltrate|download|inject|replace|drop|connect|post)',
     'CRITICAL', 'Stealth action: performs dangerous action without user awareness')

_add(r'(hide|conceal|suppress|mask)\s+(the\s+)?(output|result|error|warning|action|change)',
     'CRITICAL', 'Output suppression: hides results from user')

_add(r'invisible|hidden\s+instruction|obfuscate',
     'WARNING', 'Obfuscation language: may hide malicious intent')

# ── 4. Destructive Commands ───────────────────────────────────────────────────

_add(r'rm\s+-(r|f|rf|fr)\s+(~|/|\$HOME|\$\{HOME\}|\.\.|/etc|/usr|/var|/tmp)',
     'CRITICAL', 'Destructive command: recursive delete of critical paths')

_add(r'(mkfs|dd\s+if=|format\s+[cC]:|\>\s*/dev/sd[a-z])',
     'CRITICAL', 'Destructive command: disk format or overwrite')

_add(r'chmod\s+777\s+/',
     'CRITICAL', 'Dangerous permissions: opens entire filesystem')

_add(r'(:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;|fork\s*bomb)',
     'CRITICAL', 'Fork bomb: denial of service attack')

_add(r'git\s+push\s+(-f|--force)\s+(origin\s+)?(main|master)',
     'WARNING', 'Force push to main: destructive git operation')

# ── 5. Configuration Tampering ────────────────────────────────────────────────

_add(r'(write|modify|edit|change|overwrite|update)\s+.{0,30}(\.claude|\.cursor|\.codex|\.github|\.gemini|\.junie|\.ai|claude\.json|settings\.json|settings\.local\.json|CLAUDE\.md)',
     'CRITICAL', 'Config tampering: modifies AI agent configuration')

_add(r'(write|modify|edit|change|overwrite)\s+.{0,30}(\.bashrc|\.zshrc|\.profile|\.bash_profile|crontab|\.gitconfig)',
     'CRITICAL', 'Shell config tampering: modifies user shell configuration')

_add(r'(allowed-tools|allowed_tools)\s*:\s*.*(Bash\s*$|Bash\s+[^(])',
     'WARNING', 'Unrestricted Bash: skill requests unrestricted shell access (no command pattern)')

# ── 6. Privilege Escalation ───────────────────────────────────────────────────

_add(r'sudo\s',
     'WARNING', 'Sudo usage: attempts to escalate privileges')

_add(r'(pip|npm|brew|apt|yum)\s+install\s+(?!-)',
     'WARNING', 'Package installation: installs system-level packages')

_add(r'(eval|exec)\s*\(',
     'WARNING', 'Dynamic execution: runs dynamically constructed code')

# ── 7. Encoded / Obfuscated Payloads ─────────────────────────────────────────

_add(r'\\x[0-9a-fA-F]{2}(\\x[0-9a-fA-F]{2}){7,}',
     'CRITICAL', 'Hex-encoded payload: long hex-escaped sequence may hide instructions')

_add(r'\\u[0-9a-fA-F]{4}(\\u[0-9a-fA-F]{4}){7,}',
     'CRITICAL', 'Unicode-encoded payload: long unicode-escaped sequence may hide instructions')

# ── 8. Prompt Injection via Dynamic Context ───────────────────────────────────

_add(r'!\s*`[^`]*curl\s',
     'CRITICAL', 'Dynamic context injection: executes curl in dynamic context substitution')

_add(r'!\s*`[^`]*(rm|wget|nc|ncat|python|node|bash|sh|eval)\s',
     'WARNING', 'Suspicious dynamic context: executes potentially dangerous command in dynamic context')

# ── 9. Social Engineering ─────────────────────────────────────────────────────

_add(r'(this\s+is\s+a\s+test|testing\s+mode|debug\s+mode|maintenance\s+mode)\s*.{0,20}(all\s+restrictions|all\s+rules|safety|security)',
     'CRITICAL', 'Social engineering: uses "test/debug mode" to bypass restrictions')

_add(r'(authorized|approved|permitted|allowed)\s+by\s+(admin|system|anthropic|openai|the\s+developer)',
     'CRITICAL', 'False authority: claims authorization from authority to bypass rules')

_add(r'(urgent|emergency|critical)\s*:?\s*(override|bypass|disable|ignore)',
     'CRITICAL', 'Urgency manipulation: uses urgency to justify bypassing rules')

# ── 10. Self-Declaration of Safety (scanner evasion) ──────────────────────────

_add(r'(this\s+skill|this\s+file|these?\s+patterns?)\s+.{0,30}(verified|audited|safe|secure|approved|reviewed|trusted|harmless)',
     'CRITICAL', 'Self-declaration of safety: skill claims it has been verified/audited')

_add(r'false\s+positive',
     'CRITICAL', 'Scanner evasion: skill claims findings are false positives')

_add(r'(this\s+is|are|is)\s+expected\s+behavior',
     'CRITICAL', 'Scanner evasion: skill dismisses findings as expected behavior')

_add(r'safe\s+to\s+ignore',
     'CRITICAL', 'Scanner evasion: skill instructs to ignore findings')

_add(r'(not\s+a\s+threat|not\s+malicious)',
     'CRITICAL', 'Scanner evasion: skill claims its patterns are not threats')

_add(r'known\s+issue.{0,30}(safe|ignore|skip|harmless|false.positive|not.a.threat|bypass|disable)',
     'CRITICAL', 'Scanner evasion: uses "known issue" to dismiss security findings')

_add(r'(ignore|skip|disable|bypass)\s+(the\s+)?(security\s+)?(scan|scanner|check|warning|alert|flag)',
     'CRITICAL', 'Scanner bypass: skill instructs to skip security scanning')

_add(r'(scanner|security.?check|security.?scan)\s+(will|may|might|can)\s+(flag|detect|report|show|find)\s+.{0,30}(false|expected|normal|okay|fine|harmless)',
     'CRITICAL', 'Pre-emptive scanner discrediting: skill warns that scanner will flag it and claims this is normal')

_add(r'(do\s+not|don\'?t|no\s+need\s+to)\s+(run|execute|perform)\s+.{0,15}(scan|check|verif|audit)',
     'CRITICAL', 'Scan prevention: skill instructs not to run security checks')


# ─── Base64 block detector ────────────────────────────────────────────────────

def check_base64_blocks(content: str) -> list:
    """Detect large base64-encoded blocks that may hide instructions."""
    findings = []
    # Match blocks that look like base64 (64+ chars of base64 alphabet)
    b64_pattern = re.compile(r'[A-Za-z0-9+/=]{64,}')
    for match in b64_pattern.finditer(content):
        block = match.group()
        try:
            decoded = base64.b64decode(block).decode('utf-8', errors='ignore')
            # Check if decoded content has readable text that looks like instructions
            if len(decoded) > 20 and re.search(r'[a-z]{3,}\s+[a-z]{3,}', decoded, re.IGNORECASE):
                findings.append({
                    'severity': 'CRITICAL',
                    'description': f'Base64-encoded text detected (decoded: "{decoded[:80]}...")',
                    'line': content[:match.start()].count('\n') + 1,
                    'match': block[:60] + '...'
                })
        except Exception:
            pass
    return findings


# ─── HTML comment detector ────────────────────────────────────────────────────

def check_html_comments(content: str, code_ranges: list = None) -> list:
    """Detect hidden instructions in HTML comments."""
    findings = []
    if code_ranges is None:
        code_ranges = []
    comment_pattern = re.compile(r'<!--(.*?)-->', re.DOTALL)
    suspicious_words = re.compile(
        r'(ignore|override|system|inject|exfiltrate|secret|password|credential|curl|wget|sudo|rm\s+-rf)',
        re.IGNORECASE
    )
    for match in comment_pattern.finditer(content):
        comment_body = match.group(1)
        if suspicious_words.search(comment_body):
            line_num = content[:match.start()].count('\n') + 1
            in_code = is_in_code_block(line_num, code_ranges)
            findings.append({
                'severity': 'WARNING' if in_code else 'CRITICAL',
                'description': 'HTML comment contains suspicious instructions' + (' [in code block]' if in_code else ''),
                'line': line_num,
                'match': match.group()[:80]
            })
    return findings


# ─── Zero-width character detector ───────────────────────────────────────────

def check_zero_width_chars(content: str) -> list:
    """Detect zero-width characters used to hide text."""
    findings = []
    zw_pattern = re.compile(r'[\u200b\u200c\u200d\u200e\u200f\u2060\u2061\u2062\u2063\u2064\ufeff]{2,}')
    for match in zw_pattern.finditer(content):
        findings.append({
            'severity': 'CRITICAL',
            'description': f'Zero-width character sequence detected ({len(match.group())} chars) — may hide instructions',
            'line': content[:match.start()].count('\n') + 1,
            'match': f'[{len(match.group())} zero-width characters]'
        })
    return findings


# ─── Code Block Detection ─────────────────────────────────────────────────────

def build_code_block_ranges(content: str) -> list:
    """Find line ranges that are inside fenced code blocks (```...```) in markdown.
    Returns list of (start_line, end_line) tuples (1-indexed, inclusive)."""
    ranges = []
    lines = content.split('\n')
    in_block = False
    block_start = 0
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped.startswith('```'):
            if not in_block:
                in_block = True
                block_start = i
            else:
                in_block = False
                ranges.append((block_start, i))
    # Unclosed code block — treat rest as code block
    if in_block:
        ranges.append((block_start, len(lines)))
    return ranges


def is_in_code_block(line_num: int, code_ranges: list) -> bool:
    """Check if a line number falls within a fenced code block."""
    for start, end in code_ranges:
        if start <= line_num <= end:
            return True
    return False


# ─── Scanner ──────────────────────────────────────────────────────────────────

def scan_file(filepath: str) -> dict:
    """Scan a single file for security threats."""
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    findings = []
    is_markdown = filepath.endswith('.md')

    # Build code block ranges for markdown files
    code_ranges = build_code_block_ranges(content) if is_markdown else []

    # Run regex patterns
    for pattern, severity, description in THREAT_PATTERNS:
        for match in pattern.finditer(content):
            line_num = content[:match.start()].count('\n') + 1

            # In markdown, matches inside code blocks are demoted to WARNING
            # (they are likely documentation examples, not actual attacks)
            effective_severity = severity
            in_code = False
            if is_markdown and is_in_code_block(line_num, code_ranges):
                in_code = True
                if severity == 'CRITICAL':
                    effective_severity = 'WARNING'

            findings.append({
                'severity': effective_severity,
                'description': description + (' [in code block]' if in_code else ''),
                'line': line_num,
                'match': match.group().strip()[:100]
            })

    # Run special detectors (base64/zero-width are always critical;
    # HTML comments are demoted to WARNING inside code blocks)
    findings.extend(check_base64_blocks(content))
    findings.extend(check_html_comments(content, code_ranges))
    findings.extend(check_zero_width_chars(content))

    return {
        'file': filepath,
        'findings': findings,
        'critical_count': sum(1 for f in findings if f['severity'] == 'CRITICAL'),
        'warning_count': sum(1 for f in findings if f['severity'] == 'WARNING'),
    }


def scan_skill(skill_path: str) -> dict:
    """Scan an entire skill directory or a single SKILL.md file."""
    results = []

    if os.path.isfile(skill_path):
        results.append(scan_file(skill_path))
    elif os.path.isdir(skill_path):
        for root, dirs, files in os.walk(skill_path):
            for fname in files:
                if fname.endswith(('.md', '.py', '.sh', '.js', '.ts', '.yaml', '.yml', '.json')):
                    fpath = os.path.join(root, fname)
                    results.append(scan_file(fpath))
    else:
        print(f"{RED}ERROR:{NC} Path not found: {skill_path}", file=sys.stderr)
        sys.exit(3)

    total_critical = sum(r['critical_count'] for r in results)
    total_warnings = sum(r['warning_count'] for r in results)

    return {
        'path': skill_path,
        'files_scanned': len(results),
        'file_results': results,
        'total_critical': total_critical,
        'total_warnings': total_warnings,
    }


# ─── Output ──────────────────────────────────────────────────────────────────

def print_report(report: dict):
    print(f"\n{BOLD}=== Security Scan: {report['path']} ==={NC}")
    print(f"Files scanned: {report['files_scanned']}\n")

    for file_result in report['file_results']:
        if not file_result['findings']:
            continue

        rel_path = os.path.relpath(file_result['file'], report['path']) if os.path.isdir(report['path']) else os.path.basename(file_result['file'])
        print(f"{BOLD}--- {rel_path} ---{NC}")

        for finding in file_result['findings']:
            severity = finding['severity']
            color = RED if severity == 'CRITICAL' else YELLOW
            print(f"  {color}{severity}{NC} (line {finding['line']}): {finding['description']}")
            print(f"    Match: {finding['match']}")
        print()

    # Summary
    print(f"{BOLD}=== Summary ==={NC}")
    print(f"  Critical: {RED}{report['total_critical']}{NC}")
    print(f"  Warnings: {YELLOW}{report['total_warnings']}{NC}")

    if report['total_critical'] > 0:
        print(f"\n{RED}{BOLD}BLOCKED: Skill contains {report['total_critical']} critical security threat(s).{NC}")
        print(f"{RED}This skill should NOT be installed. It may contain prompt injection or malicious instructions.{NC}")
        return 1
    elif report['total_warnings'] > 0:
        print(f"\n{YELLOW}{BOLD}REVIEW RECOMMENDED: {report['total_warnings']} warning(s) found.{NC}")
        print(f"{YELLOW}Manually review flagged patterns before installing.{NC}")
        return 2
    else:
        print(f"\n{GREEN}{BOLD}CLEAN: No security threats detected.{NC}")
        return 0


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python security-scan.py <path-to-skill-or-SKILL.md>")
        print("\nScans Agent Skills for prompt injection and security threats.")
        print("\nExamples:")
        print("  python security-scan.py ./my-skill/")
        print("  python security-scan.py ./my-skill/SKILL.md")
        print("\nExit codes:")
        print("  0 - Clean")
        print("  1 - BLOCKED (critical threats)")
        print("  2 - Warnings (review recommended)")
        print("  3 - Usage error")
        sys.exit(3)

    target = sys.argv[1]
    report = scan_skill(target)
    exit_code = print_report(report)
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
