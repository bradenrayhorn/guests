{
  pkgs,
  osConfig,
  lib,
  ...
}:
let
  cacheEnv = builtins.readFile ./cache-env.sh;

  # Gateway starts the backend directly, without an interactive/login shell, so
  # variables from home.sessionVariables and zsh's init file are not available.
  # Wrap the backend entry point so IntelliJ and all of its child processes get
  # the cache configuration regardless of how Gateway launches it.
  remoteIdea = pkgs.jetbrains.idea.overrideAttrs (previous: {
    postInstall = (previous.postInstall or "") + ''
      wrapProgram "$out/idea/bin/remote-dev-server.sh" \
        --run ${lib.escapeShellArg cacheEnv} \
        --set NPM_CONFIG_USERCONFIG /persist/npm/.npmrc
    '';
  });
in
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

  programs.jetbrains-remote = lib.mkIf osConfig.profiles.intellij.enable {
    enable = true;
    ides = [ remoteIdea ];
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
