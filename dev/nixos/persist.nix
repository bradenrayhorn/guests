{ ... }:
let
  subagentModels = builtins.toFile "subagent-models.json" (builtins.toJSON {
    models = {
      fast = null;
      capable = null;
    };
  });
in
{
  systemd.tmpfiles.rules = [
    "d /persist/.pi 0700 braden braden -"
    "d /persist/.pi/config 0700 braden braden -"
    "d /persist/.pi/config/extensions 0700 braden braden -"
    "d /persist/.pi/config/extensions/subagents 0700 braden braden -"
    "d /persist/.pi/config/extensions/subagents/overrides 0700 braden braden -"
    # Copy only if absent; leave the user's model choices untouched on rebuilds.
    "C /persist/.pi/config/extensions/subagents/overrides/models.json 0600 braden braden - ${subagentModels}"
    "d /persist/.pi/sessions 0700 braden braden -"
    "d /persist/npm 0700 braden braden -"
    "d /persist/direnv 0700 braden braden -"
    "d /persist/.gradle 0700 braden braden -"
  ];
}
