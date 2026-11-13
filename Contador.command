#!/bin/bash
# Abre opencode en esta carpeta con el MCP de finanzas conectado (doble clic en Mac).
cd "$(dirname "$0")" || exit 1
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -x /usr/local/bin/brew ] && eval "$(/usr/local/bin/brew shellenv)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export PATH="$HOME/.mcp-starter-kit/node/bin:$HOME/.local/bin:$HOME/.opencode/bin:$HOME/.opencode-npm/bin:$PATH"
if ! command -v node >/dev/null; then echo "Falta Node.js. Ejecuta primero Iniciar.command (instala todo)."; read -n 1 -s -r -p "Tecla para cerrar..."; exit 1; fi
[ -d node_modules ] || npm install
[ -f dist/index.js ] || npm run build
if ! command -v opencode >/dev/null; then echo "Falta opencode. Ejecuta primero Iniciar.command (lo instala y configura la IA)."; read -n 1 -s -r -p "Tecla para cerrar..."; exit 1; fi
exec opencode
