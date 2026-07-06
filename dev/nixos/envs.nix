{
  pkgs,
  lib,
  config,
  ...
}:
let
  node22Env = pkgs.writeText "node22" ''
    PATH_add ${lib.getBin pkgs.nodejs_22}/bin
    PATH_add ${lib.getBin pkgs.pnpm}/bin
    PATH_add ${lib.getBin pkgs.yarn}/bin
  '';

  java21Env = pkgs.writeText "java21" ''
    export JAVA_HOME=${pkgs.jdk21}
    PATH_add ${lib.getBin pkgs.jdk21}/bin
  '';
in
{
  # Expose stable image-baked direnv snippets.
  # Project .envrc examples:
  #   source_env /var/envs/node22
  #   source_env /var/envs/java21
  system.activationScripts.vzmFlakes.text = ''
    rm -rf /var/envs
    mkdir -p /var/envs
    ln -s ${node22Env} /var/envs/node22
  ''
  + lib.optionalString config.profiles.jvm.enable ''
    ln -s ${java21Env} /var/envs/java21
  '';
}
