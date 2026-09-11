#!/bin/zsh

g() {
  local cmd=${1:-switch}

  case "$cmd" in
    switch)
      local target
      # Search through groups, but don't descend into discovered repos.
      target=$(find /data/git -type d \
        -exec test -d '{}/.git' \; -print -prune 2>/dev/null | \
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
