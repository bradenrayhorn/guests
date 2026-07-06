{
  pkgs,
  osConfig,
  lib,
  ...
}:
{
  imports = [
    ./git.nix
    ./neovim.nix
    ./tmux.nix
    ./zsh.nix
    ./direnv.nix
    ./pi.nix
  ];

  home.username = "braden";
  home.homeDirectory = "/home/braden";

  home.sessionVariables = {
    NPM_CONFIG_USERCONFIG = "/persist/npm/.npmrc";
  };

  home.packages = [
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
