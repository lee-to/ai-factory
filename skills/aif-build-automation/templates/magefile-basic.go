//go:build mage

// Build automation for the project.
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/magefile/mage/mg"
	"github.com/magefile/mage/sh"
)

// --- Variables ---

var (
	// Default target when running `mage` without arguments.
	Default = Build

	// Aliases for common targets.
	Aliases = map[string]interface{}{
		"b": Build,
		"t": Test,
		"l": Lint,
		"c": Clean,
	}
)

func version() string {
	v, _ := sh.Output("git", "describe", "--tags", "--always", "--dirty")
	if v == "" {
		return "dev"
	}
	return v
}

func commit() string {
	c, _ := sh.Output("git", "rev-parse", "--short", "HEAD")
	if c == "" {
		return "unknown"
	}
	return c
}

func buildTime() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func module() string {
	m, _ := sh.Output("head", "-1", "go.mod")
	// Extract module name: "module github.com/user/project" -> "github.com/user/project"
	if len(m) > 7 {
		return m[7:]
	}
	return ""
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// --- Development ---

// Build compiles the project binary.
func Build() error {
	mod := module()
	ldflags := fmt.Sprintf(
		"-s -w -X %s/internal/version.Version=%s -X %s/internal/version.Commit=%s -X %s/internal/version.BuildTime=%s",
		mod, version(), mod, commit(), mod, buildTime(),
	)
	return sh.RunV("go", "build", "-ldflags", ldflags, "-o", "bin/app", "./cmd/app")
}

// Run builds and runs the project.
func Run() error {
	mg.Deps(Build)
	return sh.RunV("./bin/app")
}

// Dev runs the project with hot reload (requires air).
func Dev() error {
	return sh.RunV("air")
}

// Generate runs go generate.
func Generate() error {
	return sh.RunV("go", "generate", "./...")
}

// Tidy tidies and verifies go.mod.
func Tidy() error {
	if err := sh.RunV("go", "mod", "tidy"); err != nil {
		return err
	}
	return sh.RunV("go", "mod", "verify")
}

// --- Testing ---

// Test runs the test suite.
func Test() error {
	return sh.RunV("go", "test", "-race", "-count=1", "./...")
}

// TestCover runs tests with coverage report.
func TestCover() error {
	if err := sh.RunV("go", "test", "-race", "-count=1", "-coverprofile=coverage.out", "./..."); err != nil {
		return err
	}
	if err := sh.RunV("go", "tool", "cover", "-html=coverage.out", "-o", "coverage.html"); err != nil {
		return err
	}
	fmt.Println("Coverage report: coverage.html")
	return nil
}

// TestIntegration runs integration tests.
func TestIntegration() error {
	return sh.RunV("go", "test", "-race", "-count=1", "-tags=integration", "./...")
}

// Bench runs benchmarks.
func Bench() error {
	return sh.RunV("go", "test", "-bench=.", "-benchmem", "./...")
}

// --- Code Quality ---

// Lint runs golangci-lint.
func Lint() error {
	return sh.RunV("golangci-lint", "run", "./...")
}

// Fmt formats the code.
func Fmt() error {
	if err := sh.RunV("go", "fmt", "./..."); err != nil {
		return err
	}
	return sh.RunV("goimports", "-w", ".")
}

// Vet runs go vet.
func Vet() error {
	return sh.RunV("go", "vet", "./...")
}

// --- CI ---

// CI runs the full CI pipeline (lint, test, build in parallel).
func CI() {
	mg.Deps(Lint, Test, Build)
}

// --- Cleanup ---

// Clean removes build artifacts.
func Clean() error {
	for _, path := range []string{"bin", "coverage.out", "coverage.html"} {
		if err := sh.Rm(path); err != nil {
			return fmt.Errorf("removing %s: %w", path, err)
		}
	}
	return nil
}
