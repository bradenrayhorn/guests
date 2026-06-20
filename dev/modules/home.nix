{
  pkgs,
  pkgs-unstable,
  ...
}:
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
    GRADLE_USER_HOME = "/var/gradle";
    PNPM_HOME = "/var/pnpm";
  };

  home.packages = [
    pkgs-unstable.pi-coding-agent

    pkgs.jq
    pkgs.curl
  ];

  home.stateVersion = "26.05";
}
