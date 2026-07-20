{
  lib,
  ...
}:
with lib;
{
  options.profiles = {
    jvm.enable = mkEnableOption "Kotlin/java development support";
    intellij.enable = mkEnableOption "Whether to enable the IntelliJ remote server";
    docker.enable = mkEnableOption "Whether to enable docker";
  };
}
