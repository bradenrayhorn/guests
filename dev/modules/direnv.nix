{ pkgs, ... }:
{
  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    config = {
      hide_env_diff = true;
    };
  };

  systemd.tmpfiles.rules = [
    "d /persist/direnv 0700 braden braden -"
    "d /home/braden/.local/share 0700 braden braden -"
    "d /home/braden/.local/share/direnv 0700 braden braden -"
  ];

  systemd.services.direnv-persist = {
    description = "Bind mount direnv state into /persist";
    wantedBy = [ "multi-user.target" ];
    after = [ "local-fs.target" "persist.mount" ];
    requires = [ "persist.mount" ];
    restartIfChanged = false;
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStop = "${pkgs.util-linux}/bin/umount /home/braden/.local/share/direnv";
    };
    script = ''
      set -eu

      mkdir -p /home/braden/.local/share/direnv

      if ! ${pkgs.gnugrep}/bin/grep -Fqs " /home/braden/.local/share/direnv " /proc/mounts; then
        ${pkgs.util-linux}/bin/mount --bind /persist/direnv /home/braden/.local/share/direnv
      fi
    '';
  };
}
