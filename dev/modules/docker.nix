{ lib, config, ... }:
with lib;
{
  config = mkIf config.profiles.docker.enable {
    virtualisation.docker.rootless = {
      enable = true;
      setSocketVariable = true;
    };
  };
}
