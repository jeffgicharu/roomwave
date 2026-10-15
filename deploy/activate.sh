#!/usr/bin/env bash
#
# Puts an uploaded release live. Installed as /usr/local/bin/roomwave-activate.
#
# The deploy pipeline reaches this through an SSH key whose only permitted
# command is this script, so the one thing it can ask for is "activate the
# release with this commit id".
#
# The server runs in one of two slots, on ports 8300 and 8301, and nginx sends
# visitors to one of them. A new release is started in the idle slot, beside
# the live one, and must pass its check there: it signs in, starts a session,
# joins it from two phones (WebSocket and long-polling), votes, and sees the
# votes counted on the presenter's screen. Only then do visitors reach it.
# The pages and a live connection are then checked again through nginx; if
# they fail, nginx and the static files go back to the release before, which
# has been running all along.
#
# To go back by hand, run this script with the commit id of an earlier
# release that is still in the releases directory.

set -euo pipefail

BASE=/var/www/roomwave.jeffgicharu.com
HOST=roomwave.jeffgicharu.com
APP_USER=roomwave
NODE=$BASE/runtime/node/bin/node
ENV_FILE=$BASE/shared/env
UPSTREAM=/etc/nginx/roomwave/upstream.conf
KEEP_RELEASES=5

release_id="${SSH_ORIGINAL_COMMAND:-${1:-}}"

if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Expected a 40 character commit id." >&2
    exit 64
fi

release="$BASE/releases/$release_id"

for file in server/dist/web.mjs server/dist/worker.mjs server/dist/migrate.mjs server/dist/check-release.mjs public/index.html public/app-shell.html public/unavailable.html REVISION; do
    if [[ ! -f "$release/$file" ]]; then
        echo "Release $release_id has not been uploaded completely ($file is missing)." >&2
        exit 66
    fi
done

# One deploy at a time.
exec 9>"$BASE/.activate.lock"
flock -n 9 || { echo "Another activation is running." >&2; exit 75; }

# Runs one of the release's own tools as the application user, with the site's
# settings. The settings file is read by node, never by a shell.
tool() {
    local name="$1"; shift
    ( cd "$release/server" && sudo -u "$APP_USER" -- "$NODE" --env-file="$ENV_FILE" "dist/$name.mjs" "$@" )
}

# nginx is shared by every site on this server. If its configuration is
# already broken by something else, nothing here should touch it.
if ! sudo nginx -t >/dev/null 2>&1; then
    echo "nginx's configuration does not pass its own test before this release changed anything." >&2
    echo "Nothing was changed. Find out which site broke it before deploying again." >&2
    exit 70
fi

live_port="$(grep -oE '127\.0\.0\.1:830[01]' "$UPSTREAM" | head -n1 | cut -d: -f2 || true)"
case "$live_port" in
    8300) idle_port=8301 ;;
    8301) idle_port=8300 ;;
    *) echo "Cannot tell which slot is live from $UPSTREAM." >&2; exit 70 ;;
esac
previous="$(readlink -f "$BASE/current" 2>/dev/null || true)"
first_release=""
[[ -z "$previous" || ! -d "$previous" ]] && first_release=yes

echo "Sharing this release's scripts, styles and fonts"
for dir in _app/immutable _astro; do
    if [[ -d "$release/public/$dir" ]]; then
        mkdir -p "$BASE/shared/static/$dir"
        rsync -a "$release/public/$dir/" "$BASE/shared/static/$dir/"
    fi
done
mkdir -p "$BASE/shared/pages"
cp "$release/public/unavailable.html" "$BASE/shared/pages/unavailable.html"

echo "Migrating the database"
tool migrate

echo "Adding anything missing from the starting data"
tool seed

echo "Starting release ${release_id:0:7} on port $idle_port"
sudo systemctl stop "roomwave-web@$idle_port.service" 2>/dev/null || true
ln -sfn "$release" "$BASE/slots/$idle_port.new"
mv -Tf "$BASE/slots/$idle_port.new" "$BASE/slots/$idle_port"
sudo systemctl start "roomwave-web@$idle_port.service"

abandon() {
    sudo systemctl stop "roomwave-web@$idle_port.service" 2>/dev/null || true
    echo "$1" >&2
    exit 1
}

started=""
for attempt in $(seq 1 40); do
    if curl --silent --max-time 3 --head "http://127.0.0.1:$idle_port/api/health" 2>/dev/null | grep -qi "^x-release: $release_id"; then
        started=yes
        break
    fi
    sleep 1
done
if [[ -z "$started" ]]; then
    sudo journalctl -u "roomwave-web@$idle_port.service" -n 30 --no-pager >&2 || true
    abandon "Release ${release_id:0:7} did not start. The site is unchanged."
fi

# The gate. Visitors are still on the release before, so a release that fails
# here never reaches them.
echo "Checking the release before it goes live"
if ! tool check-release --base "http://127.0.0.1:$idle_port" --release "$release_id"; then
    abandon "Release ${release_id:0:7} failed its check and was not put live."
fi

point_nginx_at() {
    printf 'server 127.0.0.1:%s;\n' "$1" | sudo tee "$UPSTREAM.new" >/dev/null
    sudo mv -f "$UPSTREAM.new" "$UPSTREAM"
    sudo nginx -t >/dev/null 2>&1 || return 1
    sudo systemctl reload nginx
}

point_static_at() {
    ln -sfn "$1" "$BASE/current.new"
    mv -Tf "$BASE/current.new" "$BASE/current"
}

# Asks the web server on this machine for a page under the public name. The
# certificate is the one Cloudflare trusts, not one curl knows, hence --insecure.
fetch() {
    curl --silent --show-error --insecure --max-time 20 --resolve "$HOST:443:127.0.0.1" "$@"
}

serves_the_release() {
    local attempt headers path
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
        headers="$(fetch --head "https://$HOST/api/health" || true)"
        if grep -qi "^x-release: $release_id" <<<"$headers"; then
            break
        fi
        if [[ $attempt -eq 10 ]]; then
            echo "The web server is not serving ${release_id:0:7}." >&2
            return 1
        fi
        sleep 1
    done
    for path in / /features /pricing /help /app /join /482913 /sitemap-index.xml /robots.txt; do
        if ! fetch --fail --output /dev/null "https://$HOST$path"; then
            echo "$path did not load on the live site." >&2
            return 1
        fi
    done
    # A live connection through nginx: the first step of every phone's join.
    if ! fetch --fail "https://$HOST/socket.io/?EIO=4&transport=polling" | grep -q '"sid"'; then
        echo "Live connections do not get through nginx." >&2
        return 1
    fi
}

go_back() {
    if [[ -n "$first_release" ]]; then
        abandon "$1 There was no release before this one to go back to."
    fi
    point_static_at "$previous"
    if point_nginx_at "$live_port"; then
        sudo systemctl restart roomwave-worker.service || true
        abandon "$1 Visitors are back on the release before."
    fi
    abandon "$1 nginx could not be pointed back. Look at this now."
}

echo "Switching visitors to release ${release_id:0:7}"
point_static_at "$release"
if ! point_nginx_at "$idle_port"; then
    # Put things back as they were. nginx was not reloaded.
    printf 'server 127.0.0.1:%s;\n' "$live_port" | sudo tee "$UPSTREAM" >/dev/null
    [[ -n "$previous" ]] && point_static_at "$previous"
    abandon "nginx refused its configuration. The site is unchanged."
fi

echo "Checking the live site"
if ! serves_the_release; then
    go_back "Release ${release_id:0:7} did not serve its pages."
fi

echo "Restarting the worker on release ${release_id:0:7}"
sudo systemctl enable roomwave-worker.service >/dev/null 2>&1 || true
sudo systemctl restart roomwave-worker.service
worker=""
for attempt in $(seq 1 30); do
    if curl --silent --max-time 3 --head "http://127.0.0.1:8302/health" 2>/dev/null | grep -qi "^x-release: $release_id"; then
        worker=yes
        break
    fi
    sleep 1
done
if [[ -z "$worker" ]]; then
    sudo journalctl -u roomwave-worker.service -n 30 --no-pager >&2 || true
    go_back "The worker did not start on release ${release_id:0:7}."
fi

# The slot that is live is the one that starts when the server boots.
sudo systemctl enable "roomwave-web@$idle_port.service" >/dev/null 2>&1 || true
sudo systemctl disable "roomwave-web@$live_port.service" >/dev/null 2>&1 || true

# Requests in hand on the old release are given time to finish. Stopping it
# closes its phones' connections, and they reconnect to the new release.
sleep 10
sudo systemctl stop "roomwave-web@$live_port.service" 2>/dev/null || true

echo "Removing old releases"
cd "$BASE/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    [[ "$old" =~ ^[0-9a-f]{40}$ && "$old" != "$release_id" && "$BASE/releases/$old" != "$previous" ]] || continue
    rm -rf -- "${BASE:?}/releases/$old"
done

# Fingerprinted files are kept for every release still on disk.
for dir in _app/immutable _astro; do
    [[ -d "$BASE/shared/static/$dir" ]] || continue
    keep="$(mktemp)"
    for kept in "$BASE"/releases/*/; do
        [[ -d "$kept/public/$dir" ]] && ( cd "$kept/public/$dir" && find . -type f ) >>"$keep"
    done
    sort -u "$keep" -o "$keep"
    ( cd "$BASE/shared/static/$dir" && find . -type f ) | sort | comm -23 - "$keep" | while read -r stale; do
        rm -f -- "$BASE/shared/static/$dir/$stale"
    done
    find "$BASE/shared/static/$dir" -mindepth 1 -type d -empty -delete 2>/dev/null || true
    rm -f "$keep"
done

echo "Release ${release_id:0:7} is live on port $idle_port."
