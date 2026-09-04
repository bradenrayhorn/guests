{ ... }:
{
  systemd.tmpfiles.rules = [
    "d /persist/.pi 0700 braden braden -"
    "d /persist/.pi/config 0700 braden braden -"
    "d /persist/.pi/config/extensions 0700 braden braden -"
    "d /persist/.pi/config/extensions/solution-review 0700 braden braden -"
    "d /persist/.pi/config/extensions/solution-review/overrides 0700 braden braden -"
    "d /persist/.pi/sessions 0700 braden braden -"
    "d /persist/npm 0700 braden braden -"
    "d /persist/direnv 0700 braden braden -"
    "d /persist/.gradle 0700 braden braden -"
  ];
}
