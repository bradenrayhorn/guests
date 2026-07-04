{
  pkgs,
  pkgs-unstable,
  osConfig,
  lib,
  ...
}:
let
  piAgent = import ./pi.nix { inherit pkgs pkgs-unstable; };
in
{
  imports = [
    ./git.nix
    ./neovim.nix
    ./tmux.nix
    ./zsh.nix
    ./direnv.nix
  ];

  home.username = "braden";
  home.homeDirectory = "/home/braden";

  home.sessionVariables = {
    NPM_CONFIG_USERCONFIG = "/persist/npm/.npmrc";
  };

  home.packages = [
    piAgent
    pkgs.ripgrep
    pkgs.fzf
    pkgs.jq
    pkgs.curl
  ];

  home.file = lib.optionalAttrs osConfig.profiles.jvm.enable {
    "jdks/jdk21".source = "${pkgs.jdk21}/lib/openjdk";
  };

  home.stateVersion = "26.05";
}
