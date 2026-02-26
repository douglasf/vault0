.PHONY: build install uninstall clean dev start help typecheck test opencode

# Ensure bun is discoverable (installed via ~/.bun)
BUN := $(or $(shell which bun 2>/dev/null),$(HOME)/.bun/bin/bun)

# Install prefix — defaults to ~/.local/bin (user-writable, no sudo needed).
# Override with: make install PREFIX=/usr/local/bin
PREFIX ?= $(HOME)/.local/bin

# Default target
help:
	@echo "Vault0 — Terminal Kanban Board"
	@echo ""
	@echo "Available commands:"
	@echo "  make build      - Build vault0 locally (no install)"
	@echo "  make install    - Build and install vault0 to $(PREFIX)"
	@echo "  make uninstall  - Remove vault0 from $(PREFIX)"
	@echo "  make dev        - Run with auto-reload (bun --watch)"
	@echo "  make start      - Run once (bun run)"
	@echo "  make typecheck  - Run TypeScript type checker"
	@echo "  make clean      - Remove build artifacts"
	@echo "  make opencode   - Install opencode config to ~/.config/vault0"
	@echo "  make help       - Show this message"
	@echo ""
	@echo "Installation:"
	@echo "  make install"
	@echo "  vault0"
	@echo ""
	@echo "Development:"
	@echo "  make dev"
	@echo ""
	@echo "CLI Usage (after install or via bun run):"
	@echo "  vault0 task add --title \"Fix bug\" --priority high"
	@echo "  vault0 task list --status todo --format json"
	@echo "  vault0 task view <ID>"
	@echo "  vault0 task help    # Full CLI reference"
	@echo ""

build: clean
	@echo "📦 Installing dependencies..."
	$(BUN) install
	@echo "🔨 Building Vault0..."
	$(BUN) build --compile src/index.tsx --outfile vault0
	@echo "🔏 Signing binary (required on macOS/Apple Silicon)..."
	codesign --sign - --force vault0
	@echo ""
	@echo "✓ Vault0 built and signed as ./vault0"
	@echo ""

install: build
	@mkdir -p $(PREFIX)
	@echo "📦 Installing to $(PREFIX)..."
	rm -f $(PREFIX)/vault0
	cp vault0 $(PREFIX)/vault0
	@echo "🔏 Clearing provenance and re-signing at final location..."
	xattr -cr $(PREFIX)/vault0
	codesign --sign - --force $(PREFIX)/vault0
	@rm vault0
	@echo "🎨 Installing theme files..."
	@mkdir -p $(HOME)/.config/vault0/themes
	@for f in themes/*.json; do \
		cp "$$f" $(HOME)/.config/vault0/themes/; \
	done
	@echo ""
	@echo "✓ Vault0 installed and signed at $(PREFIX)/vault0"
	@echo "  Run 'vault0' from any directory to start"
	@if ! echo "$$PATH" | tr ':' '\n' | grep -qx '$(PREFIX)'; then \
		echo ""; \
		echo "⚠  $(PREFIX) is not in your PATH."; \
		echo "   Add this to your shell profile (~/.zshrc or ~/.bashrc):"; \
		echo ""; \
		echo "     export PATH=\"$(PREFIX):\$$PATH\""; \
		echo ""; \
	fi

uninstall:
	@echo "Removing Vault0..."
	rm -f $(PREFIX)/vault0
	@echo "✓ Uninstalled from $(PREFIX)"
	@echo ""

dev:
	@echo "Starting Vault0 in watch mode..."
	BUN_WATCH=1 $(BUN) --watch run src/index.tsx

start:
	@echo "Starting Vault0..."
	$(BUN) run src/index.tsx

typecheck:
	$(BUN) run typecheck

test:
	$(BUN) test

clean:
	@echo "Cleaning build artifacts..."
	rm -f vault0 vault0.exe
	@echo "✓ Clean"

opencode:
	@echo "📦 Installing opencode configuration..."
	@mkdir -p $(HOME)/.config/vault0/opencode
	@cp -R opencode/* $(HOME)/.config/vault0/opencode/
	@echo ""
	@echo "✓ Opencode config installed to ~/.config/vault0/opencode"
	@echo ""
	@echo "Add this to your ~/.zshrc or ~/.bashrc:"
	@echo ""
	@echo "  export OPENCODE_CONFIG_DIR=~/.config/vault0/opencode"
	@echo ""
