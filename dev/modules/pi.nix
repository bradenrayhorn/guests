{ pkgs, pkgs-unstable }:
pkgs.writeShellScriptBin "pi" ''
  export PI_CODING_AGENT_DIR=/persist/.pi
  export PI_OFFLINE=true
  exec ${pkgs-unstable.pi-coding-agent}/bin/pi "$@"
''
