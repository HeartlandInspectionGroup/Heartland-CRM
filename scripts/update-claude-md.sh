#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# update-claude-md.sh
#
# Regenerates the auto-generated sections of CLAUDE.md from the
# live repo state. Sections between <!-- BEGIN AUTO:NAME --> and
# <!-- END AUTO:NAME --> markers are replaced; everything else
# is preserved so hand-written content stays intact.
#
# Called automatically by the pre-commit hook.
# ────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CLAUDE_MD="$REPO_ROOT/CLAUDE.md"

if [ ! -f "$CLAUDE_MD" ]; then
  echo "update-claude-md: CLAUDE.md not found, skipping."
  exit 0
fi

# ── Helper: count files matching a glob (returns 0 if none) ──
count_glob() {
  local dir="$1" pattern="$2"
  find "$dir" -maxdepth 1 -name "$pattern" 2>/dev/null | wc -l | tr -d ' '
}

# ════════════════════════════════════════════════════════════════
# AUTO:STRUCTURE — regenerate the file tree
# ════════════════════════════════════════════════════════════════
generate_structure() {
  cat <<'HEADER'
## Repository Structure

```
/
HEADER

  # ── Root HTML files ──
  for f in $(find "$REPO_ROOT" -maxdepth 1 -name '*.html' | sort); do
    fname=$(basename "$f")
    # Generate a short description from the page's <title> or <h1>
    desc=""
    case "$fname" in
      index.html)               desc="Homepage with booking wizard, pricing, calendar" ;;
      admin.html)               desc="Password-protected admin panel" ;;
      faq.html)                 desc="General FAQ page" ;;
      sample-report.html)       desc="Inspection report showcase" ;;
      scheduler.html)           desc="Spectora scheduling embed" ;;
      branding-guidelines.html) desc="Brand standards reference" ;;
      *)                        desc="HTML page" ;;
    esac
    printf '├── %-30s  # %s\n' "$fname" "$desc"
  done

  # ── services/ ──
  local svc_count
  svc_count=$(count_glob "$REPO_ROOT/services" '*.html')
  printf '├── %-30s  # Service detail pages (%s pages)\n' "services/" "$svc_count"
  local svc_files
  svc_files=$(find "$REPO_ROOT/services" -maxdepth 1 -name '*.html' | sort)
  local svc_last
  svc_last=$(echo "$svc_files" | tail -1)
  for f in $svc_files; do
    fname=$(basename "$f")
    if [ "$f" = "$svc_last" ]; then
      printf '│   └── %s\n' "$fname"
    else
      printf '│   ├── %s\n' "$fname"
    fi
  done

  # ── assets/ ──
  echo "├── assets/"
  if [ -d "$REPO_ROOT/assets/css" ]; then
    local css_lines
    css_lines=$(wc -l < "$REPO_ROOT/assets/css/styles.css" 2>/dev/null || echo "?")
    printf '│   ├── css/styles.css          # Single unified stylesheet (~%s lines)\n' "$css_lines"
  fi
  if [ -d "$REPO_ROOT/assets/js" ]; then
    echo "│   └── js/"
    local js_files
    js_files=$(find "$REPO_ROOT/assets/js" -maxdepth 1 -name '*.js' | sort)
    local js_last
    js_last=$(echo "$js_files" | tail -1)
    for f in $js_files; do
      fname=$(basename "$f")
      desc=""
      case "$fname" in
        main.js)                   desc="Contact form handler, phone formatting, FAQ accordion" ;;
        availability-config.js)    desc="HEARTLAND_CONFIG object (schedule, pricing, coupons)" ;;
        availability-calendar.js)  desc="Calendar widget for slot selection" ;;
        *)                         desc="JavaScript module" ;;
      esac
      if [ "$f" = "$js_last" ]; then
        printf '│       └── %-28s # %s\n' "$fname" "$desc"
      else
        printf '│       ├── %-28s # %s\n' "$fname" "$desc"
      fi
    done
  fi

  # ── shared/ ──
  echo "├── shared/                     # Reusable UI modules (injected via JS)"
  local shared_files
  shared_files=$(find "$REPO_ROOT/shared" -maxdepth 1 -name '*.js' | sort)
  local shared_last
  shared_last=$(echo "$shared_files" | tail -1)
  for f in $shared_files; do
    fname=$(basename "$f")
    desc=""
    case "$fname" in
      header.js)      desc="Dynamic navigation header" ;;
      footer.js)      desc="Dynamic footer with social/contact links" ;;
      service-faq.js) desc="Supabase-powered FAQ loader for service pages" ;;
      *)              desc="Shared module" ;;
    esac
    if [ "$f" = "$shared_last" ]; then
      printf '│   └── %-28s # %s\n' "$fname" "$desc"
    else
      printf '│   ├── %-28s # %s\n' "$fname" "$desc"
    fi
  done

  # ── functions/ ──
  echo "├── functions/                  # Netlify Functions (serverless backend)"
  local fn_files
  fn_files=$(find "$REPO_ROOT/functions" -maxdepth 1 -name '*.js' | sort)
  local fn_last
  fn_last=$(echo "$fn_files" | tail -1)
  for f in $fn_files; do
    fname=$(basename "$f")
    # Extract one-line purpose from JSDoc header (clean trailing punctuation)
    desc=$(sed -n 's/^ \* *//p' "$f" | head -6 | grep -v "^Netlify Function:" | grep -v "^$" | head -1 | sed 's/,$//' | sed 's/\.$//')
    [ -z "$desc" ] && desc="Netlify Function"
    if [ "$f" = "$fn_last" ]; then
      printf '│   └── %-28s # %s\n' "$fname" "$desc"
    else
      printf '│   ├── %-28s # %s\n' "$fname" "$desc"
    fi
  done

  # ── Collect remaining entries (dirs + config files) ──
  local -a remaining=()
  for d in images docs; do
    [ -d "$REPO_ROOT/$d" ] && remaining+=("dir:$d")
  done
  for f in netlify.toml package.json robots.txt; do
    [ -f "$REPO_ROOT/$f" ] && remaining+=("file:$f")
  done

  local total=${#remaining[@]}
  local idx=0
  for entry in "${remaining[@]}"; do
    idx=$((idx + 1))
    local prefix="├──"
    [ "$idx" -eq "$total" ] && prefix="└──"

    local kind="${entry%%:*}"
    local name="${entry#*:}"
    if [ "$kind" = "dir" ]; then
      local file_count
      file_count=$(find "$REPO_ROOT/$name" -maxdepth 1 -type f | wc -l | tr -d ' ')
      printf '%s %-30s  # %s files\n' "$prefix" "$name/" "$file_count"
    else
      desc=""
      case "$name" in
        netlify.toml) desc="Netlify config (redirects, headers)" ;;
        package.json) desc="npm dependencies" ;;
        robots.txt)   desc="Crawl directives" ;;
      esac
      printf '%s %-30s  # %s\n' "$prefix" "$name" "$desc"
    fi
  done

  echo '```'
}

# ════════════════════════════════════════════════════════════════
# AUTO:FUNCTIONS — regenerate functions table + env vars
# ════════════════════════════════════════════════════════════════
generate_functions() {
  cat <<'HEADER'
## Netlify Functions (Backend)

Functions are in `/functions/` and exposed via API redirects defined in `netlify.toml`:

| Function | API Route | Purpose |
|----------|-----------|---------|
HEADER

  # Build route map from netlify.toml
  declare -A routes
  local current_from=""
  while IFS= read -r line; do
    if [[ "$line" =~ from[[:space:]]*=[[:space:]]*\"(/api/[^\"]+)\" ]]; then
      current_from="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ to[[:space:]]*=[[:space:]]*\"/.netlify/functions/([^\"]+)\" ]]; then
      routes["${BASH_REMATCH[1]}"]="$current_from"
      current_from=""
    fi
  done < "$REPO_ROOT/netlify.toml"

  # List each function
  for f in $(find "$REPO_ROOT/functions" -maxdepth 1 -name '*.js' | sort); do
    fname=$(basename "$f")
    base="${fname%.js}"
    route="${routes[$base]:-"(direct)"}"
    # Extract purpose from JSDoc (first non-empty, non-title line, clean trailing punctuation)
    purpose=$(sed -n 's/^ \* *//p' "$f" | grep -v "^Netlify Function:" | grep -v "^$" | head -1 | sed 's/,$//' | sed 's/\.$//')
    [ -z "$purpose" ] && purpose="Netlify Function"
    printf '| `%s` | `%s` | %s |\n' "$fname" "$route" "$purpose"
  done

  echo ""
  echo "### Required Environment Variables (Netlify)"

  # Scan all functions for process.env references
  local env_vars
  env_vars=$(grep -roh 'process\.env\.\([A-Z_]*\)' "$REPO_ROOT/functions/" | \
    sed 's/process\.env\.//' | sort -u)

  for var in $env_vars; do
    # Try to find an inline comment or context for this var
    desc=""
    case "$var" in
      ADMIN_PASSWORD)       desc="Admin panel authentication" ;;
      GITHUB_TOKEN)         desc="GitHub API access for config persistence" ;;
      GITHUB_REPO_OWNER)    desc="GitHub repo owner for config persistence" ;;
      GITHUB_REPO_NAME)     desc="GitHub repo name for config persistence" ;;
      AZURE_TENANT_ID)      desc="Microsoft Graph OAuth tenant" ;;
      AZURE_CLIENT_ID)      desc="Microsoft Graph OAuth client" ;;
      AZURE_CLIENT_SECRET)  desc="Microsoft Graph OAuth secret" ;;
      RENTCAST_API_KEY)     desc="RentCast property data API" ;;
      MASHVISOR_RAPIDAPI_KEY) desc="Mashvisor property data via RapidAPI" ;;
      PROPERTY_API_PROVIDER)  desc="Property API provider selection" ;;
      CONFIG_FILE_PATH)     desc="Config file path override (optional)" ;;
      GITHUB_BRANCH)        desc="Git branch for config persistence (optional)" ;;
      *)                    desc="Used in Netlify Functions" ;;
    esac
    printf -- '- `%s` — %s\n' "$var" "$desc"
  done
}

# ════════════════════════════════════════════════════════════════
# AUTO:STATS — regenerate quick stats
# ════════════════════════════════════════════════════════════════
generate_stats() {
  local root_html svc_html total_html fn_count dep_count

  root_html=$(count_glob "$REPO_ROOT" '*.html')
  svc_html=$(count_glob "$REPO_ROOT/services" '*.html')
  total_html=$((root_html + svc_html))
  fn_count=$(count_glob "$REPO_ROOT/functions" '*.js')

  # Count npm dependencies from package.json
  dep_count=$(grep -c '"[^"]*":' "$REPO_ROOT/package.json" 2>/dev/null | head -1 || echo "0")
  # More accurate: count keys in dependencies object
  dep_count=$(node -e "
    const pkg = require('$REPO_ROOT/package.json');
    const deps = Object.keys(pkg.dependencies || {});
    console.log(deps.length + ' (' + deps.join(', ') + ')');
  " 2>/dev/null || echo "unknown")

  cat <<EOF
## Repository Stats
- **Last updated:** $(date +%Y-%m-%d)
- **HTML pages:** $total_html ($root_html root + $svc_html services)
- **Netlify Functions:** $fn_count
- **npm dependencies:** $dep_count
EOF
}

# ════════════════════════════════════════════════════════════════
# Replace content between markers in CLAUDE.md
# ════════════════════════════════════════════════════════════════
replace_section() {
  local section_name="$1"
  local new_content="$2"
  local tmpfile
  tmpfile=$(mktemp)

  awk -v section="$section_name" -v replacement="$new_content" '
    BEGIN { printing = 1 }
    $0 ~ "<!-- BEGIN AUTO:" section " -->" {
      print "<!-- BEGIN AUTO:" section " -->"
      print replacement
      print "<!-- END AUTO:" section " -->"
      printing = 0
      next
    }
    $0 ~ "<!-- END AUTO:" section " -->" {
      printing = 1
      next
    }
    printing { print }
  ' "$CLAUDE_MD" > "$tmpfile"

  mv "$tmpfile" "$CLAUDE_MD"
}

# ════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════
echo "update-claude-md: Regenerating auto sections..."

replace_section "STRUCTURE" "$(generate_structure)"
replace_section "FUNCTIONS" "$(generate_functions)"
replace_section "STATS"     "$(generate_stats)"

echo "update-claude-md: Done."
