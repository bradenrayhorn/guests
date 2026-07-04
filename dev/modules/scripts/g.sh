#!/bin/zsh

g() {
  local cmd=${1:-switch}

  case "$cmd" in
    switch)
      local target
      target=$(find /data/git -type d \( -name .git -prune -o -print \) 2>/dev/null | \
        while read -r path; do
          if git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
            echo "$path"
          fi
        done | \
        fzf --prompt="repo > ")

      [[ -n "$target" ]] && cd "$target"
      ;;

    *)
      echo "Usage: g [switch]"
      return 1
      ;;
  esac
}

_g_completion() {
  local -a commands
  commands=(
    'switch:Fuzzy search and switch to a repo under /data/git'
  )

  if (( CURRENT == 2 )); then
    _describe -t commands 'g commands' commands
  fi
}

compdef _g_completion g
alias gs='g switch'
