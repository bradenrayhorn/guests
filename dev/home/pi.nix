{ config, pkgs, pkgs-unstable, ... }:
let
  piAgent = pkgs.writeShellScriptBin "pi" ''
    export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
    export PI_OFFLINE=true
    exec ${pkgs-unstable.pi-coding-agent}/bin/pi "$@"
  '';
in
{
  home.packages = [ piAgent ];

  home.file.".pi/agent" = {
    source = ./pi;
    recursive = true;
  };

  home.file.".pi/agent/sessions".source = config.lib.file.mkOutOfStoreSymlink "/persist/.pi/sessions";
  home.file.".pi/agent/auth.json".source = config.lib.file.mkOutOfStoreSymlink "/persist/.pi/auth.json";
  home.file.".pi/agent/settings.json".source = config.lib.file.mkOutOfStoreSymlink "/persist/.pi/settings.json";
}
