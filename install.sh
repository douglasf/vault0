#!/bin/sh
# install.sh — Download and install vault0 prebuilt binary
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/douglasf/vault0/main/install.sh | sh
#   curl -fsSL ... | sh -s -- --version v1.0.0
set -eu

REPO="douglasf/vault0"
BINARY_NAME="vault0"
INSTALL_DIR="${VAULT0_INSTALL_DIR:-${HOME}/.local/bin}"
VERSION=""

# ── Argument parsing ─────────────────────────────────

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      shift
      VERSION="${1:-}"
      if [ -z "$VERSION" ]; then
        echo "Error: --version requires a value (e.g., --version v1.0.0)" >&2
        exit 1
      fi
      ;;
    --version=*)
      VERSION="${1#--version=}"
      ;;
    --help|-h)
      echo "Usage: install.sh [--version VERSION]"
      echo ""
      echo "Options:"
      echo "  --version VERSION   Install a specific version (e.g., v1.0.0)"
      echo ""
      echo "Environment variables:"
      echo "  VAULT0_INSTALL_DIR  Installation directory (default: ~/.local/bin)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

# ── Platform detection ───────────────────────────────

detect_platform() {
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin*)
      platform="darwin"
      # Detect Rosetta: sysctl returns 1 if running under Rosetta translation
      if [ "$arch" = "x86_64" ]; then
        rosetta=""
        rosetta="$(sysctl -n sysctl.proc_translated 2>/dev/null || echo "0")"
        if [ "$rosetta" = "1" ]; then
          arch="arm64"
        fi
      fi
      ;;
    Linux*)
      platform="linux"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      platform="windows"
      ;;
    *)
      echo "Error: Unsupported operating system: $os" >&2
      return 1
      ;;
  esac

  case "$arch" in
    x86_64|amd64)  arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "Error: Unsupported architecture: $arch" >&2
      return 1
      ;;
  esac

  TARGET="${platform}-${arch}"
}

# ── HTTP client ──────────────────────────────────────

download() {
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$output" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
  else
    echo "Error: curl or wget is required" >&2
    return 1
  fi
}

# ── Resolve version ─────────────────────────────────

resolve_version() {
  if [ -n "$VERSION" ]; then
    echo "$VERSION"
    return
  fi

  # Fetch latest release tag from GitHub API
  tmpfile="$(mktemp)"
  if download "https://api.github.com/repos/${REPO}/releases/latest" "$tmpfile" 2>/dev/null; then
    tag="$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmpfile" | head -1)"
    rm -f "$tmpfile"
    if [ -n "$tag" ]; then
      echo "$tag"
      return
    fi
  fi
  rm -f "$tmpfile"

  echo "Error: Could not determine latest version" >&2
  return 1
}

# ── Fallback: build from source ──────────────────────

fallback_build() {
  echo ""
  echo "Falling back to building from source..."
  echo ""
  echo "To install vault0 from source, run:"
  echo ""
  echo "  git clone https://github.com/${REPO}.git"
  echo "  cd ${BINARY_NAME}"
  echo "  make install"
  echo ""
  exit 1
}

# ── Main ─────────────────────────────────────────────

main() {
  echo "Installing vault0..."
  echo ""

  if ! detect_platform; then
    fallback_build
  fi

  # Windows builds have .exe suffix
  suffix=""
  if [ "$platform" = "windows" ]; then
    suffix=".exe"
  fi

  version="$(resolve_version)" || fallback_build

  echo "  Platform:  ${TARGET}"
  echo "  Version:   ${version}"
  echo "  Directory: ${INSTALL_DIR}"
  echo ""

  # Release assets are archives: .tar.gz for unix, .zip for windows
  artifact_name="${BINARY_NAME}-${TARGET}"
  if [ "$platform" = "windows" ]; then
    archive_ext=".zip"
  else
    archive_ext=".tar.gz"
  fi
  download_url="https://github.com/${REPO}/releases/download/${version}/${artifact_name}${archive_ext}"

  tmpdir="$(mktemp -d)"
  archive_file="${tmpdir}/${artifact_name}${archive_ext}"

  echo "Downloading ${download_url}..."
  if ! download "$download_url" "$archive_file"; then
    rm -rf "$tmpdir"
    echo ""
    echo "Error: Download failed for ${artifact_name}${archive_ext}" >&2
    echo "No prebuilt binary available for your platform." >&2
    fallback_build
  fi

  # Extract binary from archive
  if [ "$platform" = "windows" ]; then
    unzip -qo "$archive_file" -d "$tmpdir"
  else
    tar xzf "$archive_file" -C "$tmpdir"
  fi

  # Install binary
  mkdir -p "$INSTALL_DIR"
  chmod +x "${tmpdir}/${artifact_name}${suffix}"
  mv "${tmpdir}/${artifact_name}${suffix}" "${INSTALL_DIR}/${BINARY_NAME}${suffix}"
  rm -rf "$tmpdir"

  echo ""
  echo "✓ vault0 installed to ${INSTALL_DIR}/${BINARY_NAME}${suffix}"
  echo ""

  # PATH instructions
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*)
      echo "Run 'vault0' to get started."
      ;;
    *)
      echo "${INSTALL_DIR} is not in your PATH. Add it with:"
      echo ""
      shell_name="$(basename "${SHELL:-/bin/sh}")"
      case "$shell_name" in
        zsh)
          echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.zshrc"
          echo "  source ~/.zshrc"
          ;;
        bash)
          echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ~/.bashrc"
          echo "  source ~/.bashrc"
          ;;
        fish)
          echo "  fish_add_path ${INSTALL_DIR}"
          ;;
        *)
          echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
          ;;
      esac
      echo ""
      echo "Then run 'vault0' to get started."
      ;;
  esac
}

main
