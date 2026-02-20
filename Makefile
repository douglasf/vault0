.PHONY: build install uninstall clean dev start help typecheck

# Ensure bun is discoverable (installed via ~/.bun)
BUN := $(or $(shell which bun 2>/dev/null),$(HOME)/.bun/bin/bun)

# Default target
help:
	@echo "Vault0 — Terminal Kanban Board"
	@echo ""
	@echo "Available commands:"
	@echo "  make build      - Build vault0 locally (no install)"
	@echo "  make install    - Build and install vault0 to /usr/local/bin"
	@echo "  make uninstall  - Remove vault0 from /usr/local/bin"
	@echo "  make dev        - Run with auto-reload (bun --watch)"
	@echo "  make start      - Run once (bun run)"
	@echo "  make typecheck  - Run TypeScript type checker"
	@echo "  make clean      - Remove build artifacts"
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
	@echo ""
	@echo "✓ Vault0 built as ./vault0"
	@echo ""

install: build
	@echo "📦 Installing to /usr/local/bin..."
	sudo cp vault0 /usr/local/bin/vault0
	@rm vault0
	@echo ""
	@echo "✓ Vault0 installed to /usr/local/bin/vault0"
	@echo "  Run 'vault0' from any directory to start"
	@echo ""

uninstall:
	@echo "Removing Vault0..."
	sudo rm -f /usr/local/bin/vault0
	@echo "✓ Uninstalled from /usr/local/bin"
	@echo ""

dev:
	@echo "Starting Vault0 in watch mode..."
	$(BUN) --watch run src/index.tsx

start:
	@echo "Starting Vault0..."
	$(BUN) run src/index.tsx

typecheck:
	$(BUN) run typecheck

clean:
	@echo "Cleaning build artifacts..."
	rm -f vault0 vault0.exe
	@echo "✓ Clean"
