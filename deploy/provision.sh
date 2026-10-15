#!/usr/bin/env bash
#
# Prepares the server for Roomwave. Run once, as deploy, from a folder that
# holds the files it installs:
#
#   nginx.conf  roomwave-web@.service  roomwave-worker.service  activate.sh
#   unavailable.html  deploy-keys.pub  staff-password
#
# It is safe to run again: anything that already exists is left alone, and no
# secret is ever printed.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BASE=/var/www/roomwave.jeffgicharu.com
NODE_VERSION=24.21.0

step() { printf '\n== %s\n' "$1"; }

step "Application user"
if id roomwave >/dev/null 2>&1; then
    echo "roomwave exists"
else
    sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin roomwave
    echo "created roomwave"
fi

step "Folders"
sudo install -d -o deploy -g deploy -m 755 "$BASE" "$BASE/releases" "$BASE/slots" "$BASE/shared" "$BASE/shared/static" "$BASE/shared/pages"
# The runtime belongs to root: neither the upload key nor the app may replace the binary the units run.
sudo install -d -o root -g root -m 755 "$BASE/runtime"
cp "$HERE/unavailable.html" "$BASE/shared/pages/unavailable.html"
ls -ld "$BASE" "$BASE"/*

step "Node $NODE_VERSION"
if [[ -x "$BASE/runtime/node/bin/node" ]] && [[ "$("$BASE/runtime/node/bin/node" --version)" == "v$NODE_VERSION" ]]; then
    echo "already installed"
else
    work="$(mktemp -d)"
    file="node-v$NODE_VERSION-linux-x64.tar.xz"
    ( cd "$work" && curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/$file" && curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" && grep " $file\$" SHASUMS256.txt | sha256sum -c - )
    sudo rm -rf "$BASE/runtime/node"
    sudo mkdir -p "$BASE/runtime/node"
    sudo tar -xJf "$work/$file" -C "$BASE/runtime/node" --strip-components=1 --no-same-owner
    rm -rf "$work"
fi
sudo chown -R root:root "$BASE/runtime"
"$BASE/runtime/node/bin/node" --version
# The processor here is old; prove this Node runs on it before anything depends on it.
"$BASE/runtime/node/bin/node" -e 'const c=require("node:crypto");console.log("node ok, scrypt", c.scryptSync("x","y",16).length)'

step "Database and settings"
if sudo test -f "$BASE/shared/env"; then
    echo "settings file exists; database left as it is"
else
    db_password="$(openssl rand -hex 24)"
    if [[ -z "$(sudo -u postgres psql -tAc "select 1 from pg_roles where rolname = 'roomwave'")" ]]; then
        # Through stdin, so the password never appears in the process list.
        printf "create role roomwave login password '%s';\n" "$db_password" | sudo -u postgres psql -q -v ON_ERROR_STOP=1
        echo "created role roomwave"
    else
        printf "alter role roomwave with password '%s';\n" "$db_password" | sudo -u postgres psql -q -v ON_ERROR_STOP=1
        echo "role roomwave existed; its password was replaced"
    fi
    if [[ -z "$(sudo -u postgres psql -tAc "select 1 from pg_database where datname = 'roomwave'")" ]]; then
        sudo -u postgres psql -q -v ON_ERROR_STOP=1 -c "create database roomwave owner roomwave"
        echo "created database roomwave"
    fi
    sudo -u postgres psql -q -v ON_ERROR_STOP=1 -c "revoke all on database roomwave from public"
    staff_password="$(tr -d '\n' < "$HERE/staff-password")"
    {
        echo "NODE_ENV=production"
        echo "SITE_URL=https://roomwave.jeffgicharu.com"
        echo "DATABASE_URL=postgres://roomwave:$db_password@127.0.0.1:5432/roomwave"
        echo "REDIS_URL=redis://127.0.0.1:6379/3"
        echo "REDIS_PREFIX=roomwave:"
        echo "APP_SECRET=$(openssl rand -hex 32)"
        echo "EMAIL_FROM=\"Roomwave <roomwave@jeffgicharu.com>\""
        echo "EMAIL_DAILY_CAP=10"
        echo "SEED_STAFF_EMAIL=amani@roomwave.jeffgicharu.com"
        echo "SEED_STAFF_PASSWORD=$staff_password"
    } | sudo tee "$BASE/shared/env" >/dev/null
    sudo chown root:roomwave "$BASE/shared/env"
    sudo chmod 640 "$BASE/shared/env"
    unset db_password staff_password
    echo "wrote the settings file"
fi
sudo ls -l "$BASE/shared/env"
echo "settings names: $(sudo cut -d= -f1 "$BASE/shared/env" | tr '\n' ' ')"

step "Redis index 3"
echo "keys in index 3: $(redis-cli -n 3 dbsize)"

step "systemd units"
sudo install -o root -g root -m 644 "$HERE/roomwave-web@.service" /etc/systemd/system/roomwave-web@.service
sudo install -o root -g root -m 644 "$HERE/roomwave-worker.service" /etc/systemd/system/roomwave-worker.service
sudo systemctl daemon-reload
echo "installed roomwave-web@.service and roomwave-worker.service"

step "Activate script"
sudo install -o root -g root -m 755 "$HERE/activate.sh" /usr/local/bin/roomwave-activate
ls -l /usr/local/bin/roomwave-activate

step "Deploy keys"
touch ~/.ssh/authorized_keys
while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    key="$(awk '{print $(NF-1)}' <<<"$line")"
    if grep -qF "$key" ~/.ssh/authorized_keys; then
        echo "already present: $(awk '{print $NF}' <<<"$line")"
    else
        printf '%s\n' "$line" >> ~/.ssh/authorized_keys
        echo "added: $(awk '{print $NF}' <<<"$line")"
    fi
done < "$HERE/deploy-keys.pub"
echo "authorized_keys lines: $(grep -c . ~/.ssh/authorized_keys)"

step "nginx"
if ! sudo nginx -t >/dev/null 2>&1; then
    echo "nginx does not pass its own test before any change. Stopping without touching it." >&2
    exit 70
fi
sudo install -d -o root -g root -m 755 /etc/nginx/roomwave
if [[ ! -f /etc/nginx/roomwave/upstream.conf ]]; then
    echo "server 127.0.0.1:8300;" | sudo tee /etc/nginx/roomwave/upstream.conf >/dev/null
fi
sudo install -o root -g root -m 644 "$HERE/nginx.conf" /etc/nginx/sites-available/roomwave.jeffgicharu.com
sudo ln -sfn /etc/nginx/sites-available/roomwave.jeffgicharu.com /etc/nginx/sites-enabled/roomwave.jeffgicharu.com
if sudo nginx -t >/dev/null 2>&1; then
    sudo systemctl reload nginx
    echo "nginx reloaded with roomwave.jeffgicharu.com"
else
    sudo rm -f /etc/nginx/sites-enabled/roomwave.jeffgicharu.com
    sudo nginx -t || true
    echo "Roomwave's nginx file failed the test and was taken out again." >&2
    exit 1
fi

step "Memory now"
free -m | head -2

echo
echo "Provisioning finished."
