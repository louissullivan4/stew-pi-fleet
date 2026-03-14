#!/usr/bin/env bash
# Pi Fleet — setup script
# Generates an SSH keypair and tests connectivity to every Pi in config/pis.yaml
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${CONFIG_FILE:-$ROOT_DIR/config/pis.yaml}"
KEY_DIR="${KEY_DIR:-$ROOT_DIR/data/ssh}"
KEY_NAME="pi_fleet_rsa"
KEY_PATH="$KEY_DIR/$KEY_NAME"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

header() { echo -e "\n${CYAN}━━  $*  ━━${NC}"; }
ok()     { echo -e "  ${GREEN}✔${NC}  $*"; }
warn()   { echo -e "  ${YELLOW}⚠${NC}  $*"; }
fail()   { echo -e "  ${RED}✘${NC}  $*"; }

# ─── Check dependencies ───────────────────────────────────────────────────────

header "Checking dependencies"

for cmd in ssh ssh-keygen ssh-copy-id python3 yq nc; do
  if command -v "$cmd" &>/dev/null; then
    ok "$cmd"
  else
    # yq and nc aren't critical — we fall back to manual parsing
    if [[ "$cmd" == "yq" || "$cmd" == "nc" ]]; then
      warn "$cmd not found — some features may be limited"
    else
      fail "$cmd not found — please install it"
      exit 1
    fi
  fi
done

# ─── Parse config ─────────────────────────────────────────────────────────────

header "Reading configuration from $CONFIG_FILE"

if [[ ! -f "$CONFIG_FILE" ]]; then
  fail "Config file not found: $CONFIG_FILE"
  echo "  Copy config/pis.yaml.example and edit it with your Pi IPs."
  exit 1
fi

# Parse pis from YAML using Python (always available)
mapfile -t PI_IDS < <(python3 -c "
import yaml, sys
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
for pi in cfg.get('pis', []):
    print(pi['id'])
" 2>/dev/null)

mapfile -t PI_IPS < <(python3 -c "
import yaml, sys
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
for pi in cfg.get('pis', []):
    print(pi['ip'])
" 2>/dev/null)

mapfile -t PI_USERS < <(python3 -c "
import yaml, sys
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
for pi in cfg.get('pis', []):
    print(pi.get('ssh_user', 'pi'))
" 2>/dev/null)

mapfile -t PI_PORTS < <(python3 -c "
import yaml, sys
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
for pi in cfg.get('pis', []):
    print(pi.get('ssh_port', 22))
" 2>/dev/null)

mapfile -t PI_NAMES < <(python3 -c "
import yaml, sys
with open('$CONFIG_FILE') as f:
    cfg = yaml.safe_load(f)
for pi in cfg.get('pis', []):
    print(pi.get('name', pi['id']))
" 2>/dev/null)

if [[ ${#PI_IDS[@]} -eq 0 ]]; then
  fail "No Pis found in $CONFIG_FILE"
  exit 1
fi

ok "Found ${#PI_IDS[@]} Pi(s):"
for i in "${!PI_IDS[@]}"; do
  echo "      ${PI_NAMES[$i]} — ${PI_USERS[$i]}@${PI_IPS[$i]}:${PI_PORTS[$i]}"
done

# ─── Generate SSH keypair ─────────────────────────────────────────────────────

header "SSH keypair"

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

if [[ -f "$KEY_PATH" ]]; then
  ok "Key already exists: $KEY_PATH"
  echo "  Fingerprint: $(ssh-keygen -lf "$KEY_PATH" 2>/dev/null | awk '{print $2}')"
  read -rp "  Re-generate? [y/N] " regen
  if [[ "${regen,,}" != "y" ]]; then
    echo "  Using existing key."
  else
    rm -f "$KEY_PATH" "$KEY_PATH.pub"
    ssh-keygen -t rsa -b 4096 -C "pi-fleet@$(hostname)" -f "$KEY_PATH" -N ""
    ok "New key generated: $KEY_PATH"
  fi
else
  ssh-keygen -t rsa -b 4096 -C "pi-fleet@$(hostname)" -f "$KEY_PATH" -N ""
  ok "Key generated: $KEY_PATH"
fi

echo ""
echo -e "  ${YELLOW}Public key:${NC}"
cat "$KEY_PATH.pub"

# ─── Copy keys to each Pi ────────────────────────────────────────────────────

header "Distributing public key to Pis"
echo "  This will use ssh-copy-id — you'll need each Pi's password once."
echo ""

FAILED_COPY=()

for i in "${!PI_IDS[@]}"; do
  id="${PI_IDS[$i]}"
  name="${PI_NAMES[$i]}"
  ip="${PI_IPS[$i]}"
  user="${PI_USERS[$i]}"
  port="${PI_PORTS[$i]}"

  echo -n "  → $name ($user@$ip)... "
  if ssh-copy-id -i "$KEY_PATH.pub" -p "$port" \
       -o StrictHostKeyChecking=accept-new \
       -o ConnectTimeout=10 \
       "$user@$ip" 2>/dev/null; then
    echo -e "${GREEN}done${NC}"
  else
    echo -e "${RED}failed${NC}"
    FAILED_COPY+=("$name")
    warn "Could not copy key to $name — you may need to do it manually:"
    echo "    ssh-copy-id -i $KEY_PATH.pub -p $port $user@$ip"
  fi
done

# ─── Test connectivity ────────────────────────────────────────────────────────

header "Testing SSH connectivity"

FAILED_SSH=()

for i in "${!PI_IDS[@]}"; do
  id="${PI_IDS[$i]}"
  name="${PI_NAMES[$i]}"
  ip="${PI_IPS[$i]}"
  user="${PI_USERS[$i]}"
  port="${PI_PORTS[$i]}"

  printf "  → %-28s" "$name ($ip)"
  if ssh -i "$KEY_PATH" \
         -p "$port" \
         -o StrictHostKeyChecking=accept-new \
         -o BatchMode=yes \
         -o ConnectTimeout=10 \
         "$user@$ip" \
         "echo ok" 2>/dev/null | grep -q ok; then
    hostname=$(ssh -i "$KEY_PATH" -p "$port" \
      -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 \
      "$user@$ip" "hostname" 2>/dev/null || echo "?")
    echo -e "${GREEN}connected${NC} (hostname: $hostname)"
  else
    echo -e "${RED}FAILED${NC}"
    FAILED_SSH+=("$name")
  fi
done

# ─── Check sudo for systemctl ─────────────────────────────────────────────────

header "Checking passwordless sudo for systemctl"

for i in "${!PI_IDS[@]}"; do
  name="${PI_NAMES[$i]}"
  ip="${PI_IPS[$i]}"
  user="${PI_USERS[$i]}"
  port="${PI_PORTS[$i]}"

  # Skip if SSH already failed
  if printf '%s\n' "${FAILED_SSH[@]}" | grep -q "^$name$"; then
    warn "$name — skipped (SSH failed)"
    continue
  fi

  printf "  → %-28s" "$name"
  if ssh -i "$KEY_PATH" -p "$port" \
       -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 \
       "$user@$ip" \
       "sudo -n systemctl status >/dev/null 2>&1 && echo ok" 2>/dev/null | grep -q ok; then
    echo -e "${GREEN}sudo OK${NC}"
  else
    echo -e "${YELLOW}sudo requires password or not configured${NC}"
    warn "Service start/stop/restart and scheduled reboots will fail."
    echo "    To fix, add to /etc/sudoers on $name:"
    echo "      $user ALL=(ALL) NOPASSWD: /bin/systemctl"
  fi
done

# ─── Write .env if it doesn't exist ──────────────────────────────────────────

ENV_FILE="$ROOT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  header "Generating .env"
  JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3001
JWT_SECRET=$JWT_SECRET
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=changeme
SSH_KEY_PATH=$KEY_PATH
CONFIG_PATH=$CONFIG_FILE
DB_PATH=$ROOT_DIR/data/db/fleet.db
EOF
  ok "Created .env — change DASHBOARD_PASSWORD before deploying!"
else
  ok ".env already exists — not overwritten"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

header "Setup complete"

if [[ ${#FAILED_COPY[@]} -gt 0 ]]; then
  warn "Key distribution failed for: ${FAILED_COPY[*]}"
fi
if [[ ${#FAILED_SSH[@]} -gt 0 ]]; then
  warn "SSH connection failed for: ${FAILED_SSH[*]}"
fi

if [[ ${#FAILED_COPY[@]} -eq 0 && ${#FAILED_SSH[@]} -eq 0 ]]; then
  ok "All Pis are reachable and ready."
fi

echo ""
echo "  Next steps:"
echo "    1. Edit .env — at minimum change DASHBOARD_PASSWORD"
echo "    2. Install server deps:  npm install"
echo "    3. Build the frontend:   npm run build"
echo "    4. Start the server:     npm start"
echo "       (or with Docker)      docker compose up -d"
echo ""
