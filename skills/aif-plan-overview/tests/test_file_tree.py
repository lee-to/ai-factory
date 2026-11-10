import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HELPER = Path(__file__).resolve().parents[1] / "references/plan-overview/file_tree.py"


class FileTreeTests(unittest.TestCase):
    def run_tree(self, rows, cwd=None):
        return subprocess.run([sys.executable, "-I", "-B", str(HELPER)], input=json.dumps(rows),
                              encoding="utf-8", capture_output=True, cwd=cwd, check=False)

    def test_utf8_output_with_legacy_host_encoding(self):
        result = subprocess.run([
            sys.executable, "-I", "-B", "-c",
            "import runpy,sys; sys.stdout.reconfigure(encoding='ascii'); runpy.run_path(sys.argv[1], run_name='__main__')",
            str(HELPER),
        ], input=json.dumps([{"path": "src/session.ts", "action": "create"}]),
            encoding="utf-8", capture_output=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("└── + session.ts", result.stdout)

    def test_issue_example_and_duplicate_references(self):
        rows = [
            {"path": "database/migrations/<generated migration>", "action": "create", "refs": ["P1"]},
            {"path": "src/auth/Domain/Session.php", "action": "create", "refs": ["P1"]},
            {"path": "src/auth/Domain/SessionRepositoryInterface.php", "action": "create", "refs": ["P1"]},
            {"path": "src/auth/Http/LegacyTokenController.php", "action": "delete", "refs": ["P3"]},
            {"path": "src/auth/Http/LoginController.php", "action": "modify", "refs": ["P2"]},
            {"path": "src/auth/Http/LoginController.php", "action": "modify", "refs": ["P2", "P3"]},
            {"path": "src/auth/Infrastructure/DbSessionRepository.php", "action": "create", "refs": ["P2"]},
            {"path": "tests/Unit/Auth/SessionTest.php", "action": "create", "refs": ["P1"]},
            {"path": "composer.{json,lock}", "action": "modify", "refs": ["P1"]},
        ]
        result = self.run_tree(rows)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("├── src/auth/", result.stdout)
        self.assertIn("├── database/migrations/", result.stdout)
        self.assertIn("~ LoginController.php  P2, P3", result.stdout)
        self.assertEqual(result.stdout.count("LoginController.php"), 1)
        self.assertIn("+ create: 5   ~ modify: 3   - delete: 1   (planned paths: 9)", result.stdout)

    def test_cross_product_windows_paths_and_unknowns(self):
        result = self.run_tree([
            {"path": ".\\src\\{api,ui}\\{A,B}.ts", "action": "create", "refs": ["T1"]},
            {"path": "src/api/A.ts", "action": "modify", "refs": ["T2"]},
            {"path": "src/<generated>.ts", "refs": ["T3"]},
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("* A.ts  actions: create, modify — T1, T2", result.stdout)
        self.assertIn("? <generated>.ts", result.stdout)
        self.assertIn("? unknown: 1", result.stdout)
        self.assertIn("* multiple actions: 1", result.stdout)
        self.assertIn("(planned paths: 5)", result.stdout)

    def test_no_globbing_import_side_effects_or_project_writes(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            (directory / "json.py").write_text("raise RuntimeError('project import executed')")
            (directory / "actual.ts").write_text("do not inspect me")
            before = {p.name: p.read_bytes() for p in directory.iterdir()}
            result = self.run_tree([{"path": "*.ts", "action": "modify"}], cwd=temp)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("~ *.ts", result.stdout)
            self.assertNotIn("actual.ts", result.stdout)
            self.assertEqual({p.name: p.read_bytes() for p in directory.iterdir()}, before)

    def test_rejects_bad_shapes_paths_and_expansion_limits(self):
        for row in [
            {"path": "../outside"}, {"path": "/outside"}, {"path": "C:\\outside"},
            {"path": "a/../outside"}, {"path": "a\npoison"},
            {"path": "safe", "action": "execute"}, {"path": "safe", "refs": "P1"},
            {"path": "safe", "note": 0}, {"path": "safe", "extra": "ignored?"},
            {"path": "/".join(["{a,b}"] * 9)},
        ]:
            with self.subTest(row=row):
                result = self.run_tree([row])
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, "")
        self.assertEqual(self.run_tree([{"path": str(i)} for i in range(1001)]).returncode, 1)

    def test_empty_and_oversized_input(self):
        self.assertIn("(planned paths: 0)", self.run_tree([]).stdout)
        result = subprocess.run([sys.executable, "-I", "-B", str(HELPER)], input=" " * (256 * 1024 + 1),
                                encoding="utf-8", capture_output=True, check=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
