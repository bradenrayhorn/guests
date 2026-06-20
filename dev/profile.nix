{
  lib,
  ...
}:
with lib;
{
  options.profiles = {
    jvm.enable = mkEnableOption "Kotlin/java development support";
    docker.enable = mkEnableOption "Whether to enable docker";
  };
}
