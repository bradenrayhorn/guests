{ config, ... }:
{
  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    config.hide_env_diff = true;
  };

  home.file.".local/share/direnv".source = config.lib.file.mkOutOfStoreSymlink "/persist/direnv";
}
