{
  lib,
  config,
  pkgs,
  ...
}:
with lib;
let
  proxyEnv = {
    inherit (config.environment.variables)
      HTTP_PROXY
      http_proxy
      HTTPS_PROXY
      https_proxy
      NO_PROXY
      no_proxy
      SSL_CERT_FILE
      ;
  };
in
{
  config = mkIf config.profiles.docker.enable {
    virtualisation.docker.rootless = {
      enable = true;
      setSocketVariable = true;
    };

    # The guest has no direct network path; all outbound HTTP(S) must go through
    # the vzm vsock proxy. Keep the rootless Docker daemon explicitly proxied
    # and wait for the local proxy bridge before dockerd starts. Without this,
    # image pulls try direct DNS/networking and fail with
    # "lookup registry-1.docker.io: no such host".
    systemd.user.services.docker = {
      environment = proxyEnv;
      preStart = ''
        until ${pkgs.socat}/bin/socat -T 1 - TCP-CONNECT:127.0.0.1:3128 </dev/null >/dev/null 2>&1; do
          ${pkgs.coreutils}/bin/sleep 0.2
        done
      '';
    };
  };
}
