#!/usr/bin/env bash
set -euo pipefail

# ── Release script for Vault0 ────────────────────────────
# Validates version, runs pre-checks, tags, and pushes.

BUN="${BUN:-bun}"

# ── Read version from package.json ────────────────────────
VERSION="v$(jq -r .version package.json)"
if [ "$VERSION" = "vnull" ] || [ "$VERSION" = "v" ]; then
  echo "✗ Could not read version from package.json"
  exit 1
fi

echo "📋 Preparing release $VERSION"
echo ""

# ── Compare with latest git tag (semver-aware) ───────────
LATEST_TAG=$(git tag -l 'v*' --sort=-v:refname | head -n1)

if [ -n "$LATEST_TAG" ]; then
  echo "   Latest tag: $LATEST_TAG"
  echo "   New version: $VERSION"

  # Strip leading 'v' for comparison
  latest="${LATEST_TAG#v}"
  current="${VERSION#v}"

  # Split into major.minor.patch
  IFS='.' read -r l_major l_minor l_patch <<< "$latest"
  IFS='.' read -r c_major c_minor c_patch <<< "$current"

  # Default missing components to 0
  l_major=${l_major:-0}; l_minor=${l_minor:-0}; l_patch=${l_patch:-0}
  c_major=${c_major:-0}; c_minor=${c_minor:-0}; c_patch=${c_patch:-0}

  # Compare
  newer=false
  if [ "$c_major" -gt "$l_major" ]; then
    newer=true
  elif [ "$c_major" -eq "$l_major" ]; then
    if [ "$c_minor" -gt "$l_minor" ]; then
      newer=true
    elif [ "$c_minor" -eq "$l_minor" ] && [ "$c_patch" -gt "$l_patch" ]; then
      newer=true
    fi
  fi

  if [ "$newer" != "true" ]; then
    echo ""
    echo "✗ Version $VERSION is not greater than latest tag $LATEST_TAG"
    echo "  Bump the version in package.json first."
    exit 1
  fi
  echo ""
else
  echo "   No existing tags found — this will be the first release"
  echo ""
fi

# ── Check tag doesn't already exist ──────────────────────
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "✗ Tag $VERSION already exists"
  exit 1
fi

# ── Check working tree is clean ──────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is not clean. Commit or stash changes first."
  exit 1
fi

# ── Run pre-checks (same as release workflow) ─────────────
echo "🔍 Running typecheck..."
$BUN run typecheck
echo ""

echo "🧪 Running tests..."
$BUN test
echo ""

echo "✓ All checks passed"
echo ""

# ── Confirmation prompt ──────────────────────────────────
echo "This will:"
echo "  1. Create git tag $VERSION"
echo "  2. Push tag to origin (triggers release workflow)"
echo ""
printf "Are you sure? [y/N] "
read -r confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo ""

# ── Create tag and push ─────────────────────────────────
echo "🏷️  Creating tag $VERSION..."
git tag -a "$VERSION" -m "Release $VERSION"

echo "🚀 Pushing to origin..."
git push origin "$VERSION"

echo ""
echo "✓ Release $VERSION tagged and pushed!"
echo "  GitHub Actions will build and publish the release."
