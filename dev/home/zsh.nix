{
  pkgs,
  lib,
  ...
}:
{
  programs.zsh = {
    enable = true;
    initContent = lib.mkOrder 1000 ''
      export PRETTIERD_LOCAL_PRETTIER_ONLY=true
      if [ -d /caches ]; then
        export GRADLE_USER_HOME=/caches/gradle
        export PNPM_HOME=/caches/pnpm
      fi

      persist_gradle_home=/persist/.gradle
      persist_gradle_properties=$persist_gradle_home/gradle.properties
      active_gradle_home=''${GRADLE_USER_HOME:-$HOME/.gradle}
      mkdir -p "$persist_gradle_home" "$active_gradle_home"
      if [ ! -e "$persist_gradle_properties" ]; then
        touch "$persist_gradle_properties"
      fi
      ln -snf "$persist_gradle_properties" "$active_gradle_home/gradle.properties"

      ${builtins.readFile ./scripts/g.sh}
    '';
    plugins = [
      {
        name = "vi-mode";
        src = pkgs.zsh-vi-mode;
        file = "share/zsh-vi-mode/zsh-vi-mode.plugin.zsh";
      }
    ];
  };
  programs.starship = {
    enable = true;
    enableZshIntegration = true;
    settings = {
      "$schema" = "https://starship.rs/config-schema.json";

      format = "$directory$git_branch$git_state$git_status$cmd_duration$line_break$python$character";

      directory = {
        style = "blue";
      };

      character = {
        success_symbol = "[❯](purple)";
        error_symbol = "[❯](red)";
        vimcmd_symbol = "[❮](green)";
      };

      git_branch = {
        format = "[$branch]($style)";
        style = "bright-black";
      };

      git_status = {
        format = "[[(*$conflicted$untracked$modified$staged$renamed$deleted)](218) ($ahead_behind$stashed)]($style)";
        style = "cyan";
        conflicted = "";
        untracked = "";
        modified = "";
        staged = "";
        renamed = "";
        deleted = "";
        stashed = "≡";
      };

      git_state = {
        format = ''\([$state( $progress_current/$progress_total)]($style)\) '';
        style = "bright-black";
      };

      cmd_duration = {
        format = "[$duration]($style) ";
        style = "yellow";
      };

      python = {
        format = "[$virtualenv]($style) ";
        style = "bright-black";
        detect_extensions = [ ];
        detect_files = [ ];
      };
    };
  };
}
