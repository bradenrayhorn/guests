{
  pkgs,
  lib,
  config,
  ...
}:
let
  node22 = pkgs.nodejs_22;
  pnpmNode22 = pkgs.pnpm.override { nodejs-slim = node22; };
  yarnNode22 = pkgs.yarn.override { nodejs = node22; };

  node24 = pkgs.nodejs_24;
  pnpmNode24 = pkgs.pnpm.override { nodejs-slim = node24; };
  yarnNode24 = pkgs.yarn.override { nodejs = node24; };

  node22Env = pkgs.writeText "node22" ''
    # PATH_add prepends, so add node last to keep Node 22 first.
    PATH_add ${lib.getBin yarnNode22}/bin
    PATH_add ${lib.getBin pnpmNode22}/bin
    PATH_add ${lib.getBin node22}/bin
  '';

  node24Env = pkgs.writeText "node24" ''
    # PATH_add prepends, so add node last to keep Node 24 first.
    PATH_add ${lib.getBin yarnNode24}/bin
    PATH_add ${lib.getBin pnpmNode24}/bin
    PATH_add ${lib.getBin node24}/bin
  '';

  java17Env = pkgs.writeText "java17" ''
    export JAVA_HOME=${pkgs.jdk17}
    PATH_add ${lib.getBin pkgs.jdk17}/bin
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
    ln -s ${node24Env} /var/envs/node24
  ''
  + lib.optionalString config.profiles.jvm.enable ''
    ln -s ${java17Env} /var/envs/java17
    ln -s ${java21Env} /var/envs/java21
  '';
}
