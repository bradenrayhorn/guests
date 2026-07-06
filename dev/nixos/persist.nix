{ ... }:
{
  systemd.tmpfiles.rules = [
    "d /persist/.pi 0700 braden braden -"
    "d /persist/npm 0700 braden braden -"
    "d /persist/direnv 0700 braden braden -"
  ];
}
